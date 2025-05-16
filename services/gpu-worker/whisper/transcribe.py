import sys
import json
import argparse
from faster_whisper import WhisperModel
import time
import logging
import os
import requests
import tempfile

# Configure basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# --- Argument Parsing ---
def parse_arguments():
    parser = argparse.ArgumentParser(description='Transcribe audio using faster-whisper.')
    parser.add_argument('audio_source', type=str, help='Path or URL to the audio file.')
    parser.add_argument('--model_size', type=str, default='large-v3', 
                        help='Whisper model size (e.g., tiny, base, small, medium, large-v1, large-v2, large-v3)')
    parser.add_argument('--device', type=str, default='auto', help='Device to use (e.g., cpu, cuda, auto)')
    parser.add_argument('--compute_type', type=str, default='default', 
                        help='Compute type (e.g., default, int8, float16, int8_float16)')
    return parser.parse_args()

# --- Audio Handling ---
def download_audio(url):
    logging.info(f"Downloading audio from: {url}")
    try:
        response = requests.get(url, stream=True, timeout=30) # Add timeout
        response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
        
        # Create a temporary file to store the downloaded audio
        # Suffix helps Whisper determine file type, default if none provided
        suffix = os.path.splitext(url)[1] or '.tmp'
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        
        with temp_file as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)
        logging.info(f"Audio downloaded successfully to temporary file: {temp_file.name}")
        return temp_file.name
    except requests.exceptions.RequestException as e:
        logging.error(f"Failed to download audio: {e}")
        return None

# --- Main Transcription Logic ---
def main():
    args = parse_arguments()
    logging.info(f"Starting transcription with model: {args.model_size}, device: {args.device}, compute_type: {args.compute_type}")
    
    audio_path = args.audio_source
    temp_file_path = None
    is_url = args.audio_source.startswith('http://') or args.audio_source.startswith('https://')

    if is_url:
        temp_file_path = download_audio(args.audio_source)
        if not temp_file_path:
            sys.exit(1) # Exit if download failed
        audio_path = temp_file_path
    elif not os.path.exists(audio_path):
        logging.error(f"Audio file not found at path: {audio_path}")
        sys.exit(1)

    start_time = time.time()
    
    try:
        # Load the model
        logging.info("Loading Whisper model...")
        model = WhisperModel(args.model_size, device=args.device, compute_type=args.compute_type)
        logging.info("Model loaded successfully.")

        # Transcribe
        logging.info(f"Transcribing audio file: {audio_path}")
        # beam_size=5 is default, language='en' can be specified if needed
        segments, info = model.transcribe(audio_path, beam_size=5)

        logging.info(f"Detected language '{info.language}' with probability {info.language_probability:.2f}")
        logging.info(f"Transcription duration: {info.duration:.2f}s")

        # Prepare results as a list of dictionaries
        results = []
        for segment in segments:
            results.append({
                "start": segment.start,
                "end": segment.end,
                "text": segment.text
            })
        
        # Output results as JSON to stdout
        json.dump(results, sys.stdout, ensure_ascii=False)
        # Add a newline for cleaner parsing in Node.js
        print()

    except Exception as e:
        logging.error(f"An error occurred during transcription: {e}")
        # Output an empty JSON array or error structure to signal failure to Node.js
        json.dump({"error": str(e)}, sys.stdout)
        print()
        sys.exit(1)
    finally:
        # Clean up temporary file if one was created
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
                logging.info(f"Removed temporary audio file: {temp_file_path}")
            except OSError as e:
                logging.error(f"Error removing temporary file {temp_file_path}: {e}")

    end_time = time.time()
    logging.info(f"Transcription finished in {end_time - start_time:.2f} seconds.")

if __name__ == "__main__":
    main()
