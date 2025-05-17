import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(__dirname, './bible.sqlite'); // Assumes bible.sqlite is in the same directory

// Comprehensive mapping of book names and abbreviations to canonical IDs
// This needs to be as exhaustive as possible for common references.
const BOOK_ALIASES: { [alias: string]: string } = {
  // Pentateuch
  'genesis': 'GEN', 'gen': 'GEN', 'gn': 'GEN',
  'exodus': 'EXO', 'ex': 'EXO', 'exod': 'EXO',
  'leviticus': 'LEV', 'lev': 'LEV', 'lv': 'LEV',
  'numbers': 'NUM', 'num': 'NUM', 'nm': 'NUM', 'nb': 'NUM',
  'deuteronomy': 'DEU', 'deut': 'DEU', 'dt': 'DEU',
  // ... (History, Wisdom, Prophets) ...
  'joshua': 'JOS', 'josh': 'JOS',
  'judges': 'JDG', 'judg': 'JDG', 'jdg': 'JDG',
  'ruth': 'RUT', 'rth': 'RUT',
  '1 samuel': '1SA', '1 sam': '1SA', '1sa': '1SA', 'first samuel': '1SA', 'i samuel': '1SA',
  '2 samuel': '2SA', '2 sam': '2SA', '2sa': '2SA', 'second samuel': '2SA', 'ii samuel': '2SA',
  '1 kings': '1KI', '1 kgs': '1KI', '1ki': '1KI', 'first kings': '1KI', 'i kings': '1KI',
  '2 kings': '2KI', '2 kgs': '2KI', '2ki': '2KI', 'second kings': '2KI', 'ii kings': '2KI',
  '1 chronicles': '1CH', '1 chron': '1CH', '1ch': '1CH', 'first chronicles': '1CH', 'i chronicles': '1CH',
  '2 chronicles': '2CH', '2 chron': '2CH', '2ch': '2CH', 'second chronicles': '2CH', 'ii chronicles': '2CH',
  'ezra': 'EZR', 'ezr': 'EZR',
  'nehemiah': 'NEH', 'neh': 'NEH',
  'esther': 'EST', 'esth': 'EST',
  'job': 'JOB', 'jb': 'JOB',
  'psalms': 'PSA', 'psalm': 'PSA', 'ps': 'PSA', 'psa': 'PSA',
  'proverbs': 'PRO', 'prov': 'PRO', 'prv': 'PRO',
  'ecclesiastes': 'ECC', 'eccles': 'ECC', 'ecc': 'ECC', 'ec': 'ECC',
  'song of solomon': 'SNG', 'song of songs': 'SNG', 'sos': 'SNG', 'sng': 'SNG', 'canticles': 'SNG', 'cant': 'SNG',
  'isaiah': 'ISA', 'isa': 'ISA', 'is': 'ISA',
  'jeremiah': 'JER', 'jer': 'JER', 'je': 'JER',
  'lamentations': 'LAM', 'lam': 'LAM',
  'ezekiel': 'EZK', 'ezek': 'EZK', 'ez': 'EZK',
  'daniel': 'DAN', 'dan': 'DAN', 'da': 'DAN',
  'hosea': 'HOS', 'hos': 'HOS', 'ho': 'HOS',
  'joel': 'JOL', 'joe': 'JOL', 'jl': 'JOL',
  'amos': 'AMO', 'am': 'AMO',
  'obadiah': 'OBA', 'obad': 'OBA', 'ob': 'OBA',
  'jonah': 'JON', 'jon': 'JON', 'jnh': 'JON',
  'micah': 'MIC', 'mic': 'MIC',
  'nahum': 'NAM', 'nah': 'NAM', 'na': 'NAM',
  'habakkuk': 'HAB', 'hab': 'HAB', 'hk': 'HAB',
  'zephaniah': 'ZEP', 'zeph': 'ZEP', 'zep': 'ZEP',
  'haggai': 'HAG', 'hag': 'HAG', 'hg': 'HAG',
  'zechariah': 'ZEC', 'zech': 'ZEC', 'zec': 'ZEC',
  'malachi': 'MAL', 'mal': 'MAL', 'ml': 'MAL',
  // Gospels
  'matthew': 'MAT', 'matt': 'MAT', 'mt': 'MAT',
  'mark': 'MRK', 'mar': 'MRK', 'mk': 'MRK',
  'luke': 'LUK', 'luk': 'LUK', 'lk': 'LUK',
  'john': 'JHN', 'joh': 'JHN', 'jn': 'JHN',
  // Acts
  'acts': 'ACT', 'act': 'ACT', 'ac': 'ACT',
  // Pauline Epistles
  'romans': 'ROM', 'rom': 'ROM', 'ro': 'ROM',
  '1 corinthians': '1CO', '1 cor': '1CO', '1co': '1CO', 'first corinthians': '1CO', 'i corinthians': '1CO',
  '2 corinthians': '2CO', '2 cor': '2CO', '2co': '2CO', 'second corinthians': '2CO', 'ii corinthians': '2CO',
  'galatians': 'GAL', 'gal': 'GAL', 'ga': 'GAL',
  'ephesians': 'EPH', 'eph': 'EPH', 'ep': 'EPH',
  'philippians': 'PHP', 'phil': 'PHP', 'ph': 'PHP',
  'colossians': 'COL', 'col': 'COL', 'co': 'COL',
  '1 thessalonians': '1TH', '1 thess': '1TH', '1th': '1TH', 'first thessalonians': '1TH', 'i thessalonians': '1TH',
  '2 thessalonians': '2TH', '2 thess': '2TH', '2th': '2TH', 'second thessalonians': '2TH', 'ii thessalonians': '2TH',
  '1 timothy': '1TI', '1 tim': '1TI', '1ti': '1TI', 'first timothy': '1TI', 'i timothy': '1TI',
  '2 timothy': '2TI', '2 tim': '2TI', '2ti': '2TI', 'second timothy': '2TI', 'ii timothy': '2TI',
  'titus': 'TIT', 'tit': 'TIT', 'ti': 'TIT',
  'philemon': 'PHM', 'philem': 'PHM', 'phm': 'PHM', 'pm': 'PHM',
  // General Epistles & Revelation
  'hebrews': 'HEB', 'heb': 'HEB',
  'james': 'JAS', 'jas': 'JAS', 'jm': 'JAS',
  '1 peter': '1PE', '1 pet': '1PE', '1pe': '1PE', 'first peter': '1PE', 'i peter': '1PE',
  '2 peter': '2PE', '2 pet': '2PE', '2pe': '2PE', 'second peter': '2PE', 'ii peter': '2PE',
  '1 john': '1JN', '1 jhn': '1JN', '1jn': '1JN', 'first john': '1JN', 'i john': '1JN',
  '2 john': '2JN', '2 jhn': '2JN', '2jn': '2JN', 'second john': '2JN', 'ii john': '2JN',
  '3 john': '3JN', '3 jhn': '3JN', '3jn': '3JN', 'third john': '3JN', 'iii john': '3JN',
  'jude': 'JUD', 'jud': 'JUD', 'jd': 'JUD',
  'revelation': 'REV', 'rev': 'REV', 're': 'REV', 'the revelation': 'REV'
};

let db: Database.Database;

/**
 * Returns a singleton connection to the local Bible SQLite database.
 *
 * @returns The active SQLite database connection.
 *
 * @throws {Error} If the database connection cannot be established.
 */
function getDbConnection(): Database.Database {
  if (!db || !db.open) {
    try {
        db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
    } catch (error) {
        console.error("Failed to connect to local Bible SQLite DB:", DB_PATH, error);
        throw new Error(`Failed to connect to Bible DB at ${DB_PATH}`);
    }
  }
  return db;
}

/**
 * Normalizes a parsed Bible book name and optional numeric prefix to a canonical book ID.
 *
 * Combines the prefix (e.g., "1st", "ii") and book name, standardizes formatting, and maps the result to a canonical book ID using known aliases.
 *
 * @param parsedBookPrefix - Optional numeric or Roman numeral prefix for the book (e.g., "1st", "ii").
 * @param parsedBookName - The name of the Bible book as parsed from input.
 * @returns The canonical book ID if recognized, or null if no match is found.
 */
function normalizeBookName(parsedBookPrefix: string | undefined, parsedBookName: string): string | null {
  let fullBookQuery = parsedBookName.toLowerCase().trim().replace(/\s+/g, ' ');
  if (parsedBookPrefix) {
    const prefix = parsedBookPrefix.toLowerCase().trim();
    if (prefix === '1st' || prefix === 'i') fullBookQuery = `1 ${fullBookQuery}`;
    else if (prefix === '2nd' || prefix === 'ii') fullBookQuery = `2 ${fullBookQuery}`;
    else if (prefix === '3rd' || prefix === 'iii') fullBookQuery = `3 ${fullBookQuery}`;
    else fullBookQuery = `${prefix} ${fullBookQuery}`; 
  }
  return BOOK_ALIASES[fullBookQuery] || null;
}

// Regex to capture book, chapter, and verse(s)
// Supports formats like: John 3:16, 1 John 3:16, John 3:16-18, Psalms 119:1
// Does not support chapter-only references like "John 3" yet for direct lookup.
const BIBLE_REFERENCE_REGEX = new RegExp(
    // Optional leading number (e.g., 1, 2, 3, I, II, III) and optional period/space
    '(?:(\d{1}|[iI]{1,3}|[1-3](?:st|nd|rd|th)?)\.?\s*)?' +
    // Book name (multiple words allowed, captures aggressively then non-greedy for last word)
    '([a-zA-Z]+(?:\s+[a-zA-Z]+)*?)\.?\s+' +
    // Chapter number
    '(\d+)' +
    // Optional colon and start verse number
    '(?:\s*[:.]\s*(\d+))?' +
    // Optional dash/hyphen and end verse number (if start verse was present)
    '(?:\s*(?:-|–|to|through)\s*(\d+))?'
, 'i');

export interface ParsedReference {
    bookId: string;
    chapter: number;
    startVerse: number;
    endVerse?: number;
}

/**
 * Parses a Bible reference string and returns a structured reference object.
 *
 * Attempts to extract the canonical book ID, chapter, and verse range from the input text. Returns `null` if the reference is invalid or cannot be normalized.
 *
 * @param text - The Bible reference string to parse (e.g., "John 3:16", "1 John 3:16-18").
 * @returns A {@link ParsedReference} object with book ID, chapter, and verse range, or `null` if parsing fails.
 */
export function parseBibleReference(text: string): ParsedReference | null {
    const match = BIBLE_REFERENCE_REGEX.exec(text.trim());
    if (!match) {
        return null;
    }

    // Destructure with full awareness of potential undefined for all optional groups
    const [, rawBookPrefix, rawBookNameMatch, rawChapterMatch, rawStartVerse, rawEndVerse] = match;

    // --- Robust check for core components ---
    if (typeof rawBookNameMatch !== 'string' || typeof rawChapterMatch !== 'string') {
        // This case should ideally not happen if the regex matches,
        // but it's a safeguard and satisfies TypeScript.
        // console.warn(`Invalid regex match: core components missing for "${text}"`);
        return null;
    }
    // Now TypeScript knows rawBookNameMatch and rawChapterMatch are strings
    // ---
    
    const bookId = normalizeBookName(rawBookPrefix, rawBookNameMatch); // Pass the confirmed string
    if (!bookId) {
        // console.warn(`Could not normalize book: ${rawBookPrefix || ''} ${rawBookNameMatch}`);
        return null;
    }

    const chapter = parseInt(rawChapterMatch, 10); // Pass the confirmed string
    const startVerse = rawStartVerse ? parseInt(rawStartVerse, 10) : 1; // Default to verse 1 if only chapter given
    const endVerse = rawEndVerse ? parseInt(rawEndVerse, 10) : undefined;

    if (isNaN(chapter) || isNaN(startVerse) || (endVerse !== undefined && isNaN(endVerse))) {
        // console.warn('Failed to parse chapter/verse numbers');
        return null;
    }

    return {
        bookId,
        chapter,
        startVerse,
        endVerse: endVerse || startVerse // If no endVerse, it's a single verse query
    };
}


/**
 * Looks up and returns the Spanish text of Bible verses corresponding to a reference found in the input string.
 *
 * Parses the input for a Bible reference, normalizes the book name, and queries a local SQLite database for the specified verses in Spanish. Returns the combined verse text if found, or `null` if the reference is invalid or not found.
 *
 * @param textSegment - A string potentially containing a Bible reference (e.g., "Juan 3:16", "1 Corintios 13:4-7").
 * @returns The Spanish text of the referenced Bible verse(s), or `null` if the reference is invalid or not found.
 */
export async function findSpanishReference(textSegment: string): Promise<string | null> {
  const parsedRef = parseBibleReference(textSegment);

  if (!parsedRef) {
    return null;
  }

  const { bookId, chapter, startVerse, endVerse } = parsedRef;

  try {
    const conn = getDbConnection();
    let query = 'SELECT text_es FROM bible_verses WHERE book = ? AND chapter = ? AND verse >= ?';
    const params: (string | number)[] = [bookId, chapter, startVerse];

    if (endVerse && endVerse >= startVerse) {
      query += ' AND verse <= ? ORDER BY verse ASC';
      params.push(endVerse);
    } else {
      query += ' AND verse = ? ORDER BY verse ASC'; // Ensure it matches startVerse if no endVerse
      params.push(startVerse);
    }
    
    const stmt = conn.prepare(query);
    const rows = stmt.all(...params) as { text_es: string }[];

    if (rows && rows.length > 0) {
      return rows.map(r => r.text_es).join(' \n'); // Join multiple verses with space and newline
    }
    return null;

  } catch (error) {
    console.error(`Error looking up Bible reference ${bookId} ${chapter}:${startVerse}-${endVerse || ''}:`, error);
    return null;
  }
}

// Example Usage (for testing directly):
/*
async function test() {
    console.log("Testing Bible lookup...");
    const refsToTest = [
        "John 3:16",
        "1 John 3:16-18",
        "Genesis 1:1",
        "Revelation 22:20",
        "Ps 119:105",
        "Song of Solomon 2:4",
        "1st Corinthians 13:4",
        "NonExistentBook 1:1",
        "John 300:1" // Invalid chapter
    ];

    for (const ref of refsToTest) {
        const spanishText = await findSpanishReference(ref);
        if (spanishText) {
            console.log(`[${ref}] -> ${spanishText}`);
        } else {
            console.log(`[${ref}] -> Not found or invalid.`);
        }
    }

    // Close DB connection if it was opened
    if (db && db.open) {
        db.close();
        console.log("Test DB connection closed.");
    }
}

// test();
*/
