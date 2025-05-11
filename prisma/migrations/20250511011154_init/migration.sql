-- CreateTable
CREATE TABLE "streams" (
    "id" TEXT NOT NULL,
    "youtube_video_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "listener_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_events" (
    "id" BIGSERIAL NOT NULL,
    "stream_id" TEXT NOT NULL,
    "seconds_translated" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback" (
    "id" BIGSERIAL NOT NULL,
    "stream_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transcripts" (
    "id" BIGSERIAL NOT NULL,
    "stream_id" TEXT NOT NULL,
    "start_ts" REAL NOT NULL,
    "end_ts" REAL NOT NULL,
    "text_en" TEXT NOT NULL,
    "text_es" TEXT NOT NULL,

    CONSTRAINT "transcripts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bible_es" (
    "book" SMALLINT NOT NULL,
    "chapter" SMALLINT NOT NULL,
    "verse" SMALLINT NOT NULL,
    "text_rvr60" TEXT NOT NULL,
    "text_nvi" TEXT NOT NULL,

    CONSTRAINT "bible_es_pkey" PRIMARY KEY ("book","chapter","verse")
);

-- AddForeignKey
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_stream_id_fkey" FOREIGN KEY ("stream_id") REFERENCES "streams"("id") ON DELETE CASCADE ON UPDATE CASCADE;
