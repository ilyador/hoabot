import 'dotenv/config';
import { postTweet, replyToTweet, quoteTweet, postThread, followUser, likeTweet } from './twitter.js';
import fs from 'fs';
import path from 'path';

const POSTS_FILE = path.join(process.cwd(), 'content/posts.json');

interface Post {
  type: string;
  text: string;
  posted?: boolean;
  postedAt?: string;
  tweetId?: string;
}

function loadPosts(): Post[] {
  return JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));
}

function savePosts(posts: Post[]) {
  fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
}

function getNextPost(): { index: number; post: Post } | null {
  const posts = loadPosts();
  const index = posts.findIndex(p => !p.posted);
  if (index === -1) return null;
  return { index, post: posts[index] };
}

const command = process.argv[2];

async function main() {
  switch (command) {
    case 'list': {
      const posts = loadPosts();
      const queued = posts.filter(p => !p.posted).length;
      const posted = posts.filter(p => p.posted).length;
      console.log(`Total: ${posts.length} | Queued: ${queued} | Posted: ${posted}\n`);
      posts.forEach((p, i) => {
        const status = p.posted ? `✓ posted ${p.postedAt}` : '○ queued';
        console.log(`${i + 1}. [${p.type}] ${status}`);
        console.log(`   ${p.text.slice(0, 80)}${p.text.length > 80 ? '...' : ''}`);
        console.log();
      });
      break;
    }

    case 'next': {
      const next = getNextPost();
      if (!next) { console.log('No queued posts. Add more to content/posts.json'); return; }
      console.log(`Next post (#${next.index + 1}) [${next.post.type}]:\n`);
      console.log(next.post.text);
      console.log(`\n(${next.post.text.length} chars)`);
      break;
    }

    case 'post-next': {
      const next = getNextPost();
      if (!next) { console.log('No queued posts.'); return; }
      console.log(`Posting [${next.post.type}]...`);
      console.log(next.post.text);
      console.log();
      const result = await postTweet(next.post.text);
      const posts = loadPosts();
      posts[next.index].posted = true;
      posts[next.index].postedAt = new Date().toISOString();
      posts[next.index].tweetId = result.id;
      savePosts(posts);
      console.log(`Posted! Tweet ID: ${result.id}`);
      break;
    }

    case 'post-text': {
      const text = process.argv.slice(3).join(' ');
      if (!text) { console.error('Usage: post-text <text>'); process.exit(1); }
      const result = await postTweet(text);
      console.log(`Posted! Tweet ID: ${result.id}`);
      break;
    }

    case 'reply': {
      const tweetId = process.argv[3];
      const text = process.argv.slice(4).join(' ');
      if (!tweetId || !text) { console.error('Usage: reply <tweet-id-or-url> <text>'); process.exit(1); }
      const result = await replyToTweet(tweetId, text);
      console.log(`Replied! Tweet ID: ${result.id}`);
      break;
    }

    case 'quote': {
      const tweetUrl = process.argv[3];
      const text = process.argv.slice(4).join(' ');
      if (!tweetUrl || !text) { console.error('Usage: quote <tweet-url> <text>'); process.exit(1); }
      const result = await quoteTweet(tweetUrl, text);
      console.log(`Quoted! Tweet ID: ${result.id}`);
      break;
    }

    case 'thread': {
      // Read thread from stdin or a file
      const filePath = process.argv[3];
      if (!filePath) { console.error('Usage: thread <json-file-with-array-of-strings>'); process.exit(1); }
      const tweets = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const result = await postThread(tweets);
      console.log(`Thread posted! ${result.ids.length} tweets. IDs: ${result.ids.join(', ')}`);
      break;
    }

    case 'image-post': {
      const imagePath = process.argv[3];
      const text = process.argv.slice(4).join(' ');
      if (!imagePath || !text) { console.error('Usage: image-post <image-path> <text>'); process.exit(1); }
      const result = await postTweet(text, imagePath);
      console.log(`Posted with image! Tweet ID: ${result.id}`);
      break;
    }

    case 'like': {
      const tweetId = process.argv[3];
      if (!tweetId) { console.error('Usage: like <tweet-id-or-url>'); process.exit(1); }
      await likeTweet(tweetId);
      break;
    }

    case 'follow': {
      const username = process.argv[3]?.replace('@', '');
      if (!username) { console.error('Usage: follow <username>'); process.exit(1); }
      await followUser(username);
      console.log(`Followed @${username}`);
      break;
    }

    case 'reset': {
      const posts = loadPosts();
      posts.forEach(p => { delete p.posted; delete p.postedAt; delete p.tweetId; });
      savePosts(posts);
      console.log(`Reset ${posts.length} posts to queued.`);
      break;
    }

    default:
      console.log(`
HOABot Content CLI

Commands:
  list                              Show all posts and their status
  next                              Preview the next queued post
  post-next                         Post the next queued tweet to X
  post-text <text>                  Post specific text to X
  image-post <image> <text>         Post text with image attached
  reply <tweet-id-or-url> <text>    Reply to a tweet
  quote <tweet-url> <text>          Quote tweet with comment
  thread <json-file>                Post a thread from JSON array of strings
  like <tweet-id-or-url>            Like a tweet
  follow <username>                 Follow a user
  reset                             Reset all posts to queued
      `);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
