import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

const BIBLE_DATA_PATH = path.resolve(__dirname, '../bible-data');
const SPA_TRANSLATION_ID = 'spa_blm';

interface BookMetadata {
  id: string;
  name: string;
  numberOfChapters: number;
}

interface BooksFileStructure {
  translation: object; // Or a more specific type if needed
  books: BookMetadata[];
}

interface VerseContentItem {
    type?: string; // For note objects e.g. { noteId: number, type: 'note' (though not always present) }
    noteId?: number;
    // Allow any other properties that might exist on note objects
    [key: string]: any;
}

interface ChapterVerse {
  type: 'verse';
  number: number;
  content: (string | VerseContentItem)[]; // Array can contain strings or objects
}

interface ChapterData {
  book: { id: string };
  chapter: {
    number: number;
    content: ChapterVerse[];
  };
}

async function loadBibleData() {
  console.log('Starting Spanish Bible data load...');
  let totalVersesProcessed = 0;

  try {
    const spaBooksMetaPath = path.join(BIBLE_DATA_PATH, SPA_TRANSLATION_ID, 'books.json');
    console.log(`Reading Spanish books metadata from: ${spaBooksMetaPath}`);
    const spaBooksMetaJson = await fs.readFile(spaBooksMetaPath, 'utf-8');
    const parsedBooksFile = JSON.parse(spaBooksMetaJson) as BooksFileStructure;
    const spaBooksMetadata = parsedBooksFile.books;

    if (!Array.isArray(spaBooksMetadata)) {
        console.error('Error: Parsed books metadata is not an array. Check the structure of books.json.');
        console.error('Parsed data:', parsedBooksFile);
        throw new Error('Parsed books metadata is not an array.');
    }
    console.log(`Loaded metadata for ${spaBooksMetadata.length} Spanish books.`);

    for (const bookMeta of spaBooksMetadata) {
      console.log(`Processing Spanish book: ${bookMeta.name} (${bookMeta.id})`);
      const spaBookPath = path.join(BIBLE_DATA_PATH, SPA_TRANSLATION_ID, bookMeta.id);

      for (let chapterNum = 1; chapterNum <= bookMeta.numberOfChapters; chapterNum++) {
        const versesToCreate: any[] = [];
        try {
          const spaChapterPath = path.join(spaBookPath, `${chapterNum}.json`);
          const spaChapterJson = await fs.readFile(spaChapterPath, 'utf-8');
          const spaChapterData = JSON.parse(spaChapterJson) as ChapterData;

          for (const verseData of spaChapterData.chapter.content) {
            if (verseData.type === 'verse') {
              const spanishVerseText = verseData.content
                .filter(c => typeof c === 'string')
                .join(' ').trim();

              if (!spanishVerseText) {
                // Optionally log missing text, but can be verbose
                // console.log(`Missing Spanish text for verse ${verseData.number} in ${bookMeta.id} Chapter ${chapterNum}. Skipping verse.`);
                continue;
              }

              versesToCreate.push({
                book: bookMeta.id,
                chapter: chapterNum,
                verse: verseData.number,
                text_es: spanishVerseText,
                text_en: null, // Explicitly set English to null
              });
            }
          }

          if (versesToCreate.length > 0) {
            const result = await prisma.bibleVerse.createMany({
              data: versesToCreate,
              skipDuplicates: true, // Use skipDuplicates for all chapters
            });
            totalVersesProcessed += result.count;
            if (result.count > 0) {
                console.log(`  Chapter ${chapterNum} (${bookMeta.id}): Successfully INSERTED ${result.count} new Spanish verses.`);
            } else if (versesToCreate.length > 0 && result.count === 0) {
                // This means verses were prepared, but Prisma inserted 0 (likely all duplicates of already existing data)
                // console.log(`  Chapter ${chapterNum} (${bookMeta.id}): Prisma reported 0 new verses inserted (had ${versesToCreate.length} to process). All prepared verses likely already existed or were skipped.`);
            }
          } else {
            // console.log(`  Chapter ${chapterNum} (${bookMeta.id}): No new Spanish verses were prepared to insert for this chapter.`);
          }
        } catch (fileError: any) {
          if (fileError.code === 'ENOENT') {
            console.warn(`  Skipping Spanish chapter ${chapterNum} for book ${bookMeta.id}: File not found at ${path.join(spaBookPath, `${chapterNum}.json`)}`);
          } else {
            console.error(`  Skipping Spanish chapter ${chapterNum} for book ${bookMeta.id} due to file error: ${fileError.message}`);
          }
        }
      }
    }
    console.log(`Spanish Bible data loading complete. Total new verses inserted: ${totalVersesProcessed}`);
  } catch (error: any) {
    console.error('Error loading Spanish Bible data:', error.message, error.stack);
  } finally {
    await prisma.$disconnect();
    console.log('Prisma client disconnected.');
  }
}

loadBibleData();