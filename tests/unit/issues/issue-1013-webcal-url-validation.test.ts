/**
 * Test for Issue #1013: Can't Subscribe to Apple Calendar
 *
 * This test demonstrates that the HTML5 URL input type validation
 * rejects webcal:// and webcals:// URLs, preventing users from
 * subscribing to Apple iCloud calendars.
 *
 * Issue: https://github.com/[owner]/[repo]/issues/1013
 */

describe('Issue #1013: Apple Calendar webcal:// URL Validation', () => {

    // Note: These tests demonstrate browser behavior that is not fully implemented in JSDOM
    // They are skipped in the test environment but document the real-world issue
    it.skip('should demonstrate that HTML5 URL input rejects webcal:// protocol', () => {
        // Create a URL input element (as used in CardComponent.ts)
        const input = document.createElement('input');
        input.type = 'url';

        // Try to set a webcal:// URL (as provided by Apple Calendar)
        const webcalUrl = 'webcal://p01-caldav.icloud.com/published/2/example';
        input.value = webcalUrl;

        // HTML5 validity check
        const isValid = input.validity.valid;

        console.log('Input type:', input.type);
        console.log('URL value:', input.value);
        console.log('Is valid:', isValid);
        console.log('Validity state:', input.validity);

        // This test DEMONSTRATES THE BUG: webcal:// URLs are rejected
        expect(isValid).toBe(false);
        expect(input.validity.typeMismatch).toBe(true);
    });

    it.skip('should demonstrate that HTML5 URL input rejects webcals:// protocol', () => {
        const input = document.createElement('input');
        input.type = 'url';

        // Try to set a webcals:// URL (secure webcal)
        const webcalsUrl = 'webcals://p01-caldav.icloud.com/published/2/example';
        input.value = webcalsUrl;

        const isValid = input.validity.valid;

        console.log('Input type:', input.type);
        console.log('URL value:', input.value);
        console.log('Is valid:', isValid);

        // This test DEMONSTRATES THE BUG: webcals:// URLs are also rejected
        expect(isValid).toBe(false);
        expect(input.validity.typeMismatch).toBe(true);
    });

    it('should show that HTML5 URL input accepts https:// URLs', () => {
        const input = document.createElement('input');
        input.type = 'url';

        // Standard https:// URL
        const httpsUrl = 'https://p01-caldav.icloud.com/published/2/example';
        input.value = httpsUrl;

        const isValid = input.validity.valid;

        console.log('Input type:', input.type);
        console.log('URL value:', input.value);
        console.log('Is valid:', isValid);

        // https:// URLs are accepted
        expect(isValid).toBe(true);
    });

    it('should demonstrate that text input accepts any URL protocol', () => {
        // This shows the fix: using type="text" instead of type="url"
        const input = document.createElement('input');
        input.type = 'text';

        const webcalUrl = 'webcal://p01-caldav.icloud.com/published/2/example';
        input.value = webcalUrl;

        // Text inputs don't validate URL format
        const isValid = input.validity.valid;

        console.log('Input type:', input.type);
        console.log('URL value:', input.value);
        console.log('Is valid:', isValid);

        // Text input accepts any value
        expect(isValid).toBe(true);
    });

    it('should verify that webcal:// can be converted to https://', () => {
        // Common workaround: webcal:// is just http:// for iCalendar feeds
        // webcals:// is just https:// for iCalendar feeds

        const webcalUrl = 'webcal://p01-caldav.icloud.com/published/2/example';
        const webcalsUrl = 'webcals://p01-caldav.icloud.com/published/2/example';

        // Simple protocol replacement
        const httpUrl = webcalUrl.replace(/^webcal:\/\//, 'http://');
        const httpsUrl = webcalsUrl.replace(/^webcals:\/\//, 'https://');

        console.log('Original webcal:', webcalUrl);
        console.log('Converted to http:', httpUrl);
        console.log('Original webcals:', webcalsUrl);
        console.log('Converted to https:', httpsUrl);

        expect(httpUrl).toBe('http://p01-caldav.icloud.com/published/2/example');
        expect(httpsUrl).toBe('https://p01-caldav.icloud.com/published/2/example');

        // Verify these can be validated as URLs
        const httpInput = document.createElement('input');
        httpInput.type = 'url';
        httpInput.value = httpUrl;

        const httpsInput = document.createElement('input');
        httpsInput.type = 'url';
        httpsInput.value = httpsUrl;

        expect(httpInput.validity.valid).toBe(true);
        expect(httpsInput.validity.valid).toBe(true);
    });

    it.skip('should show realistic Apple iCloud calendar URL formats', () => {
        // Document the actual URL formats users encounter
        const examples = [
            'webcal://p01-caldav.icloud.com/published/2/MTY3NDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI',
            'webcals://p01-caldav.icloud.com/published/2/MTY3NDU2Nzg5MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTI',
            'webcal://ical.mac.com/ical/US32Holidays.ics',
        ];

        console.log('\nApple iCloud Calendar URL Examples:');
        examples.forEach((url, i) => {
            const input = document.createElement('input');
            input.type = 'url';
            input.value = url;

            console.log(`${i + 1}. ${url}`);
            console.log(`   Valid with type="url": ${input.validity.valid}`);
        });

        // All should be invalid with type="url"
        examples.forEach(url => {
            const input = document.createElement('input');
            input.type = 'url';
            input.value = url;
            expect(input.validity.valid).toBe(false);
        });
    });
});
