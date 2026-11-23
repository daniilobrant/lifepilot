#import <Foundation/Foundation.h>
#import <EventKit/EventKit.h>

static NSURL *resultURL;
static NSISO8601DateFormatter *dateParser;

static void finish(NSDictionary *result) {
    NSData *value = [NSJSONSerialization dataWithJSONObject:result options:0 error:nil];
    BOOL written = value && [value writeToURL:resultURL options:NSDataWritingAtomic error:nil];
    exit(written ? 0 : 1);
}
static void fail(NSString *code) {
    finish(@{@"ok": @NO, @"error": code});
}
static NSString *text(NSDictionary *input, NSString *field, NSUInteger limit) {
    id value = input[field];
    if (![value isKindOfClass:NSString.class] || [value length] == 0 || [value length] > limit) return nil;
    return value;
}
static BOOL writable(EKCalendar *calendar) {
    return calendar && calendar.allowsContentModifications && calendar.source.sourceType == EKSourceTypeCalDAV;
}
static NSDictionary *describe(EKCalendar *calendar) {
    return @{@"id": calendar.calendarIdentifier, @"name": calendar.title,
             @"account": calendar.source.title ?: @"Kalenderaccount"};
}
static void enumerate(EKEventStore *store) {
    NSMutableArray *answer = [NSMutableArray array];
    for (EKCalendar *calendar in [store calendarsForEntityType:EKEntityTypeEvent]) {
        if (writable(calendar) && answer.count < 150) [answer addObject:describe(calendar)];
    }
    finish(@{@"ok": @YES, @"calendars": answer});
}
static void busy(EKEventStore *store, NSDictionary *input) {
    NSDate *start = [dateParser dateFromString:text(input, @"start", 32) ?: @""];
    NSDate *end = [dateParser dateFromString:text(input, @"end", 32) ?: @""];
    if (!start || !end || [start compare:end] != NSOrderedAscending ||
        [end timeIntervalSinceDate:start] > 8 * 86400) fail(@"invalid");
    NSPredicate *range = [store predicateForEventsWithStartDate:start endDate:end calendars:nil];
    NSMutableArray *answer = [NSMutableArray array];
    __block BOOL truncated = NO;
    [store enumerateEventsMatchingPredicate:range usingBlock:^(EKEvent *event, BOOL *stop) {
        if (event.status == EKEventStatusCanceled || event.availability == EKEventAvailabilityFree) return;
        if (answer.count >= 2000) { truncated = YES; *stop = YES; return; }
        if (event.startDate && event.endDate && [event.startDate compare:event.endDate] == NSOrderedAscending) {
            [answer addObject:@{@"at": [dateParser stringFromDate:event.startDate],
                                @"endsAt": [dateParser stringFromDate:event.endDate]}];
        }
    }];
    if (truncated) fail(@"range");
    finish(@{@"ok": @YES, @"busy": answer});
}
static void create(EKEventStore *store, NSDictionary *input) {
    NSString *calendarId = text(input, @"calendarId", 256);
    NSString *title = text(input, @"title", 120);
    NSDate *start = [dateParser dateFromString:text(input, @"start", 32) ?: @""];
    NSDate *end = [dateParser dateFromString:text(input, @"end", 32) ?: @""];
    if (!title || !calendarId || !start || !end || [start compare:end] != NSOrderedAscending ||
        [start timeIntervalSinceNow] <= 0 || [end timeIntervalSinceDate:start] > 28800) fail(@"invalid");
    EKCalendar *calendar = [store calendarWithIdentifier:calendarId];
    if (!writable(calendar) || ![describe(calendar)[@"name"] isEqual:text(input, @"calendarName", 200)] ||
        ![describe(calendar)[@"account"] isEqual:text(input, @"account", 200)]) fail(@"targetChanged");

    EKEvent *event = [EKEvent eventWithEventStore:store];
    event.calendar = calendar;
    event.title = title;
    event.startDate = start;
    event.endDate = end;
    NSError *error = nil;
    if (![store saveEvent:event span:EKSpanThisEvent commit:YES error:&error] || !event.eventIdentifier) fail(@"uncertain");
    finish(@{@"ok": @YES, @"eventId": event.eventIdentifier});
}
int main(int argc, const char *argv[]) {
    @autoreleasepool {
        if (argc != 2) return 2;
        if (strcmp(argv[1], "--self-test") == 0) {
            puts("LifePilot Calendar: EventKit linked");
            return 0;
        }
        NSURL *request = [NSURL fileURLWithPath:@(argv[1])];
        resultURL = [[request URLByDeletingLastPathComponent] URLByAppendingPathComponent:@"result.json"];
        NSData *bytes = [NSData dataWithContentsOfURL:request];
        if (!bytes || bytes.length > 8192) fail(@"invalid");
        id input = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
        if (![input isKindOfClass:NSDictionary.class]) fail(@"invalid");
        NSString *operation = text(input, @"operation", 12);
        if (![@[@"list", @"create", @"busy"] containsObject:operation]) fail(@"invalid");

        dateParser = [NSISO8601DateFormatter new];
        dateParser.formatOptions = NSISO8601DateFormatWithInternetDateTime | NSISO8601DateFormatWithFractionalSeconds;
        EKEventStore *store = [EKEventStore new];
        EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:EKEntityTypeEvent];
        if ([operation isEqual:@"create"]) {
            if (status != EKAuthorizationStatusFullAccess) fail(@"permission");
            create(store, input);
        }
        if ([operation isEqual:@"busy"]) {
            if (status != EKAuthorizationStatusFullAccess) fail(@"permission");
            busy(store, input);
        }
        if (status == EKAuthorizationStatusFullAccess) enumerate(store);
        if (status != EKAuthorizationStatusNotDetermined) fail(@"permission");
        [store requestFullAccessToEventsWithCompletion:^(BOOL granted, NSError *error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                if (!granted) fail(@"permission");
                enumerate(store);
            });
        }];
        [[NSRunLoop mainRunLoop] run];
        return 1;
    }
}
