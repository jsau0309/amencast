import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();

const BIBLE_DATA_PATH = path.resolve(__dirname, '../bible-data');
// const ENG_TRANSLATION_ID = 'eng_kjv'; // No longer needed for primary loading logic
const SPA_TRANSLATION_ID = 'spa_blm';

interface BookMetadata {
  id: string; // e.g., "GEN"
  name: string; // e.g., "Genesis"
  numberOfChapters: number;
}

interface ChapterVerse {
  type: 'verse';
  number: number;
  content: (string | { noteId: number })[];
}

interface ChapterData {
  book: { id: string };
  chapter: {
    number: number;
    content: ChapterVerse[];
  };
}

async function loadBibleData() {
  console.log('Starting Spanish Bible data load (spa_blm)...');

  try {
    // 1. Read Spanish book metadata
    const booksMetaPath = path.join(BIBLE_DATA_PATH, SPA_TRANSLATION_ID, 'books.json');
    console.log(`Reading book metadata from: ${booksMetaPath}`);
    const booksMetaContent = await fs.readFile(booksMetaPath, 'utf-8');
    const booksMetadata: { books: BookMetadata[] } = JSON.parse(booksMetaContent);
    const booksToProcess = booksMetadata.books;
    console.log(`Found metadata for ${booksToProcess.length} books in Spanish translation.`);

    let totalVersesProcessed = 0;

    // 2. Iterate through books
    for (const bookMeta of booksToProcess) {
      console.log(`Processing book: ${bookMeta.name} (${bookMeta.id})`);
      const bookId = bookMeta.id;

      // 3. Iterate through chapters
      for (let chapterNum = 1; chapterNum <= bookMeta.numberOfChapters; chapterNum++) {
        const spaChapterPath = path.join(BIBLE_DATA_PATH, SPA_TRANSLATION_ID, bookId, `${chapterNum}.json`);

        try {
          // 4. Read Spanish chapter file
          const spaChapterContent = await fs.readFile(spaChapterPath, 'utf-8');
          const spaChapterData: ChapterData = JSON.parse(spaChapterContent);
          const spaVerses = spaChapterData.chapter.content;

          // 5. Prepare verse data for insertion
          const versesToCreate = [];
          for (const spaVerse of spaVerses) {
            if (spaVerse.type !== 'verse') {
              console.warn(`Non-verse item encountered in ${bookId} Chapter ${chapterNum}. Skipping item.`);
              continue;
            }

            const textEs = spaVerse.content.find(item => typeof item === 'string') as string | undefined;
            const verseNum = spaVerse.number;

            if (!textEs) {
                console.warn(`Missing Spanish text for verse ${verseNum} in ${bookId} Chapter ${chapterNum}. Skipping verse.`);
                continue;
            }

            versesToCreate.push({
              book: bookId,
              chapter: chapterNum,
              verse: verseNum,
              text_en: null, // Set text_en to null
              text_es: textEs,
            });
          }

          // 6. Insert verses into Supabase (using createMany for efficiency)
          if (versesToCreate.length > 0) {
            const result = await prisma.bibleVerse.createMany({
              data: versesToCreate,
              skipDuplicates: true, // Important if script is run multiple times
            });
            totalVersesProcessed += result.count;
            console.log(`  Chapter ${chapterNum}: Inserted ${result.count} Spanish verses.`);
          }

        } catch (fileError: any) {
          if (fileError.code === 'ENOENT') {
            console.warn(`Missing chapter file for ${bookId} Chapter ${chapterNum}. Path: ${spaChapterPath}. Skipping.`);
          } else {
            console.error(`Error processing ${bookId} Chapter ${chapterNum}:`, fileError);
          }
        }
      } // End chapter loop
    } // End book loop

    console.log(`
Spanish Bible data loading complete. Total verses processed/inserted: ${totalVersesProcessed}`);

  } catch (error) {
    console.error('An error occurred during the Spanish Bible data load process:', error);
  } finally {
    await prisma.$disconnect();
    console.log('Prisma client disconnected.');
  }
}

// Run the loading function
loadBibleData(); 