import dotenv from 'dotenv';
import path from 'path';

// Load .env from project root before any tests run
dotenv.config({ path: path.resolve(import.meta.dirname, '../.env') });
