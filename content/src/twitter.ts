import { TwitterApi } from 'twitter-api-v2';

const client = new TwitterApi({
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_TOKEN_SECRET!,
});

export async function postTweet(text: string, imagePath?: string): Promise<{ id: string; text: string }> {
  const options: any = {};

  if (imagePath) {
    const mediaId = await client.v1.uploadMedia(imagePath);
    options.media = { media_ids: [mediaId] };
    console.log(`Uploaded image: ${imagePath} → ${mediaId}`);
  }

  const { data } = await client.v2.tweet(text, options);
  console.log(`Posted tweet ${data.id}: ${text.slice(0, 50)}...`);
  return { id: data.id, text };
}

export async function replyToTweet(tweetId: string, text: string): Promise<{ id: string; text: string }> {
  if (text.length > 280) {
    throw new Error(`Reply too long: ${text.length} chars (max 280)`);
  }
  const { data } = await client.v2.reply(text, tweetId);
  console.log(`Replied to ${tweetId}: ${text.slice(0, 50)}...`);
  return { id: data.id, text };
}

export async function quoteTweet(tweetUrl: string, text: string): Promise<{ id: string; text: string }> {
  if (text.length > 280) {
    throw new Error(`Quote too long: ${text.length} chars (max 280)`);
  }
  const { data } = await client.v2.tweet(text, { quote_tweet_id: extractTweetId(tweetUrl) });
  console.log(`Quote tweeted: ${text.slice(0, 50)}...`);
  return { id: data.id, text };
}

export async function postThread(tweets: string[]): Promise<{ ids: string[] }> {
  for (const t of tweets) {
    if (t.length > 280) throw new Error(`Thread tweet too long: ${t.length} chars`);
  }
  const thread = await client.v2.tweetThread(tweets);
  const ids = thread.map((t: any) => t.data.id);
  console.log(`Posted thread with ${ids.length} tweets`);
  return { ids };
}

export async function updateProfile(params: {
  name?: string;
  description?: string;
  url?: string;
  location?: string;
}): Promise<void> {
  // v1.1 API for profile updates
  await client.v1.updateAccountProfile(params);
  console.log('Profile updated:', params);
}

export async function updateProfileImage(filePath: string): Promise<void> {
  const fs = await import('fs');
  const imageBuffer = fs.readFileSync(filePath);
  await client.v1.updateAccountProfileImage(imageBuffer);
  console.log('Profile image updated');
}

export async function updateProfileBanner(filePath: string): Promise<void> {
  const fs = await import('fs');
  const imageBuffer = fs.readFileSync(filePath);
  await client.v1.updateAccountProfileBanner(imageBuffer);
  console.log('Profile banner updated');
}

export async function likeTweet(tweetId: string): Promise<{ liked: boolean }> {
  const me = await client.v2.me();
  const id = extractTweetId(tweetId);
  await client.v2.like(me.data.id, id);
  console.log(`Liked tweet ${id}`);
  return { liked: true };
}

export async function followUser(username: string): Promise<{ following: boolean }> {
  const me = await client.v2.me();
  const target = await client.v2.userByUsername(username);
  if (!target.data) throw new Error(`User @${username} not found`);
  await client.v2.follow(me.data.id, target.data.id);
  console.log(`Followed @${username}`);
  return { following: true };
}

export async function getMyId(): Promise<string> {
  const me = await client.v2.me();
  return me.data.id;
}

function extractTweetId(urlOrId: string): string {
  const match = urlOrId.match(/status\/(\d+)/);
  return match ? match[1] : urlOrId;
}
