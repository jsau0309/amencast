import { PrismaClient } from '@prisma/client'; // This will be resolved from the root node_modules when run correctly
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Load .env from gpu-worker directory
// When compiled and run from root, __dirname will be something like /path/to/project/dist-scripts/gpu-worker/bible
// So, go up three levels to root, then to gpu-worker/.env
const dotenvPath = path.resolve(__dirname, '../../../gpu-worker/.env');
dotenv.config({ path: dotenvPath });

// Ensure DATABASE_URL for Prisma is loaded from gpu-worker/.env
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL, // This should be the Supabase URL from gpu-worker/.env
    },
  },
});

// Define path relative to the gpu-worker directory, assuming script is run from project root
const LOCAL_DB_PATH = path.resolve(process.cwd(), 'gpu-worker/bible/bible.sqlite');

async function syncBibleToLocalSqlite() {
  console.log('Starting sync from Supabase to local SQLite (bible.sqlite)...');

  if (!process.env.DATABASE_URL) {
    console.error('Error: DATABASE_URL is not set in gpu-worker/.env. Prisma needs this to connect to Supabase.');
    process.exit(1);
  }

  const localDb = new Database(LOCAL_DB_PATH, { verbose: console.log });

  try {
    // 1. Create table in local SQLite if it doesn't exist
    localDb.exec(`
      CREATE TABLE IF NOT EXISTS bible_verses (
        id TEXT PRIMARY KEY,
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        verse INTEGER NOT NULL,
        text_en TEXT,
        text_es TEXT NOT NULL,
        UNIQUE (book, chapter, verse)
      );
    `);
    console.log('Local SQLite table bible_verses ensured.');

    // 2. Fetch all verses from Supabase
    console.log('Fetching all verses from Supabase...');
    const allVerses = await prisma.bibleVerse.findMany();
    console.log(`Fetched ${allVerses.length} verses from Supabase.`);

    if (allVerses.length === 0) {
      console.warn('No verses found in Supabase. Local SQLite DB will be empty.');
      return;
    }

    // 3. Clear existing data in local SQLite table (optional, or use INSERT OR REPLACE)
    // For simplicity, let's use INSERT OR REPLACE (UPSERT)
    // localDb.exec('DELETE FROM bible_verses;');
    // console.log('Cleared existing data from local bible_verses table.');

    // 4. Insert data into local SQLite
    console.log('Inserting/updating verses into local SQLite...');
    const insertStmt = localDb.prepare(`
      INSERT OR REPLACE INTO bible_verses (id, book, chapter, verse, text_en, text_es)
      VALUES (@id, @book, @chapter, @verse, @text_en, @text_es)
    `);

    const insertMany = localDb.transaction((verses) => {
      for (const verse of verses as any[]) insertStmt.run(verse);
    });

    insertMany(allVerses.map((v: {id: string; book: string; chapter: number; verse: number; text_en: string | null; text_es: string }) => ({
        ...v,
        text_en: v.text_en || null // Ensure null if undefined for SQLite
    })));
    
    console.log(`Successfully synced ${allVerses.length} verses to local SQLite DB: ${LOCAL_DB_PATH}`);

  } catch (error) {
    console.error('Error during Bible sync to local SQLite:', error);
  } finally {
    await prisma.$disconnect();
    console.log('Prisma client (Supabase connection) disconnected.');
    if (localDb) {
      localDb.close();
      console.log('Local SQLite DB connection closed.');
    }
  }
}

// Run the sync function
syncBibleToLocalSqlite();
