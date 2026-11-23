#import <Foundation/Foundation.h>
#import <ImageIO/ImageIO.h>
#import <Vision/Vision.h>
#import <PDFKit/PDFKit.h>

int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) return 2;
        NSURL *url = [NSURL fileURLWithPath:@(argv[1])];
        NSMutableArray<NSString *> *lines = [NSMutableArray array];
        if ([url.pathExtension isEqualToString:@"pdf"]) {
            PDFDocument *document = [[PDFDocument alloc] initWithURL:url];
            if (!document || document.isLocked) return 3;
            NSUInteger totalLength = 0;
            for (NSUInteger page = 0; page < MIN(document.pageCount, 12); page++) {
                NSString *text = [document pageAtIndex:page].string;
                if (!text.length) continue;
                NSUInteger count = MIN(text.length, 4500 - totalLength);
                NSRange range = [text rangeOfComposedCharacterSequencesForRange:NSMakeRange(0, count)];
                NSString *fragment = [text substringWithRange:range];
                [lines addObject:fragment];
                totalLength += fragment.length;
                if (totalLength >= 4500) break;
            }
        } else {
            CGImageSourceRef source = CGImageSourceCreateWithURL((__bridge CFURLRef)url, NULL);
            if (!source) return 3;
            NSDictionary *properties = CFBridgingRelease(CGImageSourceCopyPropertiesAtIndex(source, 0, NULL));
            CFRelease(source);
            NSUInteger width = [properties[(id)kCGImagePropertyPixelWidth] unsignedIntegerValue];
            NSUInteger height = [properties[(id)kCGImagePropertyPixelHeight] unsignedIntegerValue];
            if (!width || !height || width > 10000 || height > 10000 || width * height > 32000000) return 3;
            VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
            request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
            request.recognitionLanguages = @[@"de-DE", @"en-US"];
            request.usesLanguageCorrection = YES;
            VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithURL:url options:@{}];
            NSError *error = nil;
            if (![handler performRequests:@[request] error:&error]) return 4;
            for (VNRecognizedTextObservation *match in request.results) {
                VNRecognizedText *candidate = [match topCandidates:1].firstObject;
                if (candidate && candidate.confidence >= 0.30) [lines addObject:candidate.string];
                if (lines.count >= 140) break;
            }
        }
        NSData *output = [NSJSONSerialization dataWithJSONObject:lines options:0 error:nil];
        if (!output || output.length > 56000) return 5;
        fwrite(output.bytes, 1, output.length, stdout);
    }
    return 0;
}
