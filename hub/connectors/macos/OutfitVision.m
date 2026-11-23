#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <CoreImage/CoreImage.h>
#import <Vision/Vision.h>

static NSString *dominantColor(CGImageRef image) {
    enum { side = 40 };
    unsigned char pixels[side * side * 4] = {0};
    CGColorSpaceRef space = CGColorSpaceCreateWithName(kCGColorSpaceSRGB);
    CGContextRef context = CGBitmapContextCreate(pixels, side, side, 8, side * 4, space,
        kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(space);
    if (!context) return @"";
    CGContextDrawImage(context, CGRectMake(0, 0, side, side), image);
    CGContextRelease(context);

    double counts[512] = {0}, red[512] = {0}, green[512] = {0}, blue[512] = {0};
    for (int y = 0; y < side; y++) for (int x = 0; x < side; x++) {
        unsigned char *p = pixels + 4 * (y * side + x);
        if (p[3] < 235) continue;
        int brightest = MAX(p[0], MAX(p[1], p[2]));
        int darkest = MIN(p[0], MIN(p[1], p[2]));
        double weight = (brightest - darkest > 32 ? 2 : 1);
        if (brightest > 230 && darkest > 218) weight *= .35;
        int bucket = (p[0] / 32) * 64 + (p[1] / 32) * 8 + p[2] / 32;
        counts[bucket] += weight;
        red[bucket] += p[0] * weight; green[bucket] += p[1] * weight; blue[bucket] += p[2] * weight;
    }
    int winner = 0;
    for (int i = 1; i < 512; i++) if (counts[i] > counts[winner]) winner = i;
    if (counts[winner] < 10) return @"";
    return [NSString stringWithFormat:@"#%02X%02X%02X",
        (int)(red[winner] / counts[winner]), (int)(green[winner] / counts[winner]), (int)(blue[winner] / counts[winner])];
}

// Two directional gradient hashes, evaluated on the uncropped image.
static NSString *imageFingerprint(CGImageRef image) {
    enum { side = 17 };
    unsigned char pixels[side * side] = {0}, bits[64] = {0};
    CGColorSpaceRef space = CGColorSpaceCreateDeviceGray();
    CGContextRef context = CGBitmapContextCreate(pixels, side, side, 8, side, space, (CGBitmapInfo)kCGImageAlphaNone);
    CGColorSpaceRelease(space);
    if (!context) return @"";
    CGContextSetGrayFillColor(context, 1, 1);
    CGContextFillRect(context, CGRectMake(0, 0, side, side));
    CGContextSetInterpolationQuality(context, kCGInterpolationHigh);
    CGContextDrawImage(context, CGRectMake(0, 0, side, side), image);
    CGContextRelease(context);
    for (int y = 0; y < 16; y++) for (int x = 0; x < 16; x++) {
        int pixel = y * side + x;
        int bit = y * 16 + x;
        if ((int)pixels[pixel] - pixels[pixel + 1] > 4) bits[bit / 8] |= (1 << (bit % 8));
        if ((int)pixels[pixel] - pixels[pixel + side] > 4) bits[32 + bit / 8] |= (1 << (bit % 8));
    }
    return [[NSData dataWithBytes:bits length:sizeof(bits)] base64EncodedStringWithOptions:0];
}

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 3 && argc != 4) return 2;
        BOOL fullPhoto = argc == 4 && strcmp(argv[3], "full") == 0;
        NSURL *url = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[1]]];
        CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
        if (!source) return 2;
        NSDictionary *size = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
        unsigned long long width = [size[(__bridge NSString *)kCGImagePropertyPixelWidth] unsignedLongLongValue];
        unsigned long long height = [size[(__bridge NSString *)kCGImagePropertyPixelHeight] unsignedLongLongValue];
        if (!width || !height || width > 10000 || height > 10000 || width * height > 32000000) {
            CFRelease(source);
            return 2;
        }
        NSDictionary *options = @{
            (__bridge NSString *)kCGImageSourceCreateThumbnailFromImageAlways: @YES,
            (__bridge NSString *)kCGImageSourceCreateThumbnailWithTransform: @YES,
            (__bridge NSString *)kCGImageSourceThumbnailMaxPixelSize: @(fullPhoto ? 1600 : 960),
        };
        CGImageRef image = CGImageSourceCreateThumbnailAtIndex(source, 0, (__bridge CFDictionaryRef)options);
        CFRelease(source);
        if (!image) return 2;

        if (fullPhoto) {
            NSURL *output = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[2]]];
            CGImageDestinationRef file = CGImageDestinationCreateWithURL((__bridge CFURLRef)output, CFSTR("public.jpeg"), 1, NULL);
            BOOL saved = NO;
            if (file) {
                NSDictionary *properties = @{(__bridge NSString *)kCGImageDestinationLossyCompressionQuality: @0.83};
                CGImageDestinationAddImage(file, image, (__bridge CFDictionaryRef)properties);
                saved = CGImageDestinationFinalize(file);
                CFRelease(file);
            }
            CGImageRelease(image);
            return saved ? 0 : 2;
        }
        VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
        VNRecognizeTextRequest *text = [VNRecognizeTextRequest new];
        text.recognitionLanguages = @[@"de-DE", @"en-US"];
        VNClassifyImageRequest *classifier = [VNClassifyImageRequest new];
        VNDetectHumanRectanglesRequest *humans = [VNDetectHumanRectanglesRequest new];
        humans.upperBodyOnly = YES;
        VNDetectFaceRectanglesRequest *faces = [VNDetectFaceRectanglesRequest new];
        VNGenerateForegroundInstanceMaskRequest *mask = [VNGenerateForegroundInstanceMaskRequest new];
        [handler performRequests:@[text] error:nil];
        [handler performRequests:@[classifier] error:nil];
        BOOL checkedPeople = [handler performRequests:@[humans, faces] error:nil];
        BOOL containsPerson = humans.results.count > 0 || faces.results.count > 0;
        [handler performRequests:@[mask] error:nil];

        NSMutableArray *lines = [NSMutableArray array], *labels = [NSMutableArray array];
        for (VNRecognizedTextObservation *line in text.results) {
            NSString *value = [line topCandidates:1].firstObject.string;
            if (value.length && lines.count < 30) [lines addObject:value];
        }
        for (VNClassificationObservation *entry in classifier.results) {
            if (entry.confidence >= .1 && labels.count < 20) [labels addObject:entry.identifier];
        }
        NSString *color = @"";
        CGImageRef product = CGImageRetain(image);
        VNInstanceMaskObservation *subject = mask.results.firstObject;
        if (subject.allInstances.count == 1) {
            CVPixelBufferRef buffer = [subject generateMaskedImageOfInstances:subject.allInstances
                fromRequestHandler:handler croppedToInstancesExtent:YES error:nil];
            if (buffer) {
                CIImage *foreground = [CIImage imageWithCVPixelBuffer:buffer];
                CGImageRef cutout = [[CIContext context] createCGImage:foreground fromRect:foreground.extent];
                if (cutout) {
                    color = dominantColor(cutout);
                    CGImageRelease(product);
                    product = cutout;
                }
                CVPixelBufferRelease(buffer);
            }
        }
        if (!color.length && !subject.allInstances.count) color = dominantColor(image);
        NSURL *output = [NSURL fileURLWithPath:[NSString stringWithUTF8String:argv[2]]];
        CGImageDestinationRef file = CGImageDestinationCreateWithURL((__bridge CFURLRef)output, CFSTR("public.png"), 1, NULL);
        BOOL saved = NO;
        if (file) {
            CGImageDestinationAddImage(file, product, NULL);
            saved = CGImageDestinationFinalize(file);
            CFRelease(file);
        }
        NSString *feature = imageFingerprint(image);
        CGImageRelease(product);
        CGImageRelease(image);
        if (!saved) return 2;
        NSData *json = [NSJSONSerialization dataWithJSONObject:@{@"lines":lines, @"labels":labels, @"color":color, @"feature":feature, @"containsPerson":@(containsPerson), @"checkedPeople":@(checkedPeople)}
            options:0 error:nil];
        if (!json) return 2;
        fwrite(json.bytes, 1, json.length, stdout);
    }
    return 0;
}
