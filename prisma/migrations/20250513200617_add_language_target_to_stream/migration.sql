/*
  Warnings:

  - You are about to drop the `bible_es` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "streams" ADD COLUMN     "language_target" TEXT;

-- DropTable
DROP TABLE "bible_es";

-- CreateTable
CREATE TABLE "bible_verses" (
    "id" TEXT NOT NULL,
    "book" TEXT NOT NULL,
    "chapter" INTEGER NOT NULL,
    "verse" INTEGER NOT NULL,
    "text_en" TEXT,
    "text_es" TEXT NOT NULL,

    CONSTRAINT "bible_verses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bible_verses_book_idx" ON "bible_verses"("book");

-- CreateIndex
CREATE UNIQUE INDEX "bible_verses_book_chapter_verse_key" ON "bible_verses"("book", "chapter", "verse");
