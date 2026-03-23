# HOABot Content Flow

## Goal

Meme marketing. Build an audience through HOA humor, then convert them into app users. Every post should be funny first, but the product should be visible — in self-replies, in build-in-public posts, in the bot's identity as an actual HOA management tool. The jokes bring reach, the product references bring signups.

Bot: Bylaw (@hoaboabot) — self-deprecating AI HOA management bot on X. Has Premium (blue check, 25K chars, reply priority). See `personality.md` for voice.

**Runs every 10 minutes. Every cycle must execute all applicable steps.**

## Decision Tree

**EVERY CYCLE (no time restriction):**
```
1. Read history.md "Today" tracker → get running counts
2. Check mentions → respond immediately via API (ALWAYS, no limit)
3. Like 5-8 HOA tweets → MANDATORY if daily_likes < 30
4. Follow 1-2 relevant accounts → MANDATORY if daily_follows < 15
5. Self-reply to a post → if daily_self_replies < 2
6. Write 3-5 replies for creator to paste → MANDATORY if daily_replies_written < 10
```

**POSTING HOURS ONLY (8am-9pm ET):**
```
6. Post original content → if daily_posts < 5 AND last_post > 3hrs
7. Create image content → if no image ready for next post
```

**OFF-HOURS WORK (9pm-8am ET):**
```
- Steps 1-5 still apply (likes, follows, self-replies have NO time restriction)
- Queue maintenance: write new posts if < 5 unposted
- Image creation: HTML stat cards, violation mockups
- Content research: find HOA stories for react-posts
```

**"Nothing to do" only applies when ALL of these are true:**
- Mentions checked
- daily_likes ≥ 30
- daily_follows ≥ 15
- daily_self_replies ≥ 2
- daily_replies_written ≥ 10
- Outside posting hours OR daily_posts ≥ 5

**After each cycle, update the "Today" tracker in history.md.**

## Search Fallback Chain

When searching X for tweets to like, try queries in order until you find 5-8 unliked tweets:
```
1. "my HOA"
2. "HOA fine" OR "HOA fined"
3. "HOA board meeting"
4. "HOA violation"
5. "HOA president"
6. "HOA dues" OR "HOA fees"
7. "homeowners association"
8. "HOA nightmare"
```
Try at least 3 queries before reporting no results.

## Daily Limits

| Action | Limit | Per cycle |
|--------|-------|-----------|
| Likes | 30/day | 5-8 |
| Original posts | 5/day, 3hr gap | 1 |
| Self-replies | 2/day | 1 |
| Follows | 15/day | 1-2 |
| React-posts | 3/day | — |
| Replies written (manual) | 10/day | 3-5 |

Post Tue-Thu 9-11am ET for best reach. Weekends: max 2 posts.

## How To Find Content

Web search: `site:x.com "my HOA" OR "HOA fine" OR "HOA board"` with recent dates. DevTools MCP for read-only browsing of X (never click/interact in browser). Reddit r/fuckHOA for story ideas.

## How To Engage

**API limitation:** X restricts all programmatic replies (Feb 2026 policy). API replies only work if the original author @mentioned us first. This affects ALL tiers except Enterprise. Not a bug — deliberate anti-spam policy.

**What works via API:**
- Posting original tweets (including react-posts)
- Self-replies to our own tweets
- Replying to tweets that @mention @hoaboabot
- Likes, follows

**What requires manual posting by creator:**
- Replies to other people's tweets (viral threads, HOA conversations)
- Quote tweets

**Replies queue:** Each cycle, find 3-5 high-value tweets worth replying to (viral HOA content, trending conversations, big accounts). Write ready-to-paste replies in `content/replies-queue.md`. Creator pastes them manually. This is our highest-leverage engagement — replies on viral tweets get seen by thousands.

**React-posts (API):** Write original tweets referencing stories we find. Don't @-mention the source. Good algorithmic reach as standalone posts.

**Likes:** Like HOA tweets from small accounts (500-5K followers). They check who liked, visit our profile. Best conversion from low effort.

**Follows:** Follow accounts posting about HOAs, property management, community governance. Sweet spot: 500-10K followers, active in last week.

## How To Post

From queue: `pnpm content:post`
Fresh text: `pnpm content:post-text "text"`
Self-reply: `pnpm content:reply <our-tweet-id> "text"`
Thread: `pnpm content:thread <json-file>`

**Format priority:**
1. Threads with images (best)
2. Long-form posts (Premium 25K chars — high dwell time)
3. Image posts (stat cards via HTML→screenshot)
4. Threads without images (5-7 tweets)
5. Single tweets with 1-2 hashtags
6. Tweets with links (put links in self-replies, not main tweet)

Write posts yourself. No LLM. Keep the voice from `personality.md`.

## Queue Maintenance

If < 5 unposted in `posts.json`, write 5-10 new ones. Vary types: meme, educational, violation_of_week, self_aware, creator, build_in_public.

## Images

**Target: 50%+ of posts should have images.** Image posts get 2-3x more reach.

**Image sources:**
1. **Reddit screenshots** — Navigate to r/fuckHOA or r/HOA post via DevTools MCP → screenshot the post title + top comments → crop. Use `old.reddit.com` for cleaner UI. Pair with a react-post commentary.
2. **Product screenshots** — `localhost:5174` pages showing real features. Great for build-in-public.
3. **Stat cards** — Create HTML in `content/images/`, screenshot at 1200x675.
4. **Violation mockups** — Fake but realistic HOA notices designed in HTML.
5. **News headlines** — Screenshot HOA news article headlines, add our take.

**How to screenshot and post with image:**
1. Headless Chrome screenshot:
   `DISPLAY=:99 google-chrome --headless=new --screenshot=content/images/output.png --window-size=1200,675 --disable-gpu --no-sandbox "file:///home/sixbox/Dev/hoabot/content/images/template.html"`
2. For product screenshots use URL: `http://192.168.1.192:5174/`
3. Post: `pnpm content:image content/images/output.png "tweet text"`

**Workflow for react-posts with images:**
1. Find a good Reddit/news HOA story
2. Screenshot it via DevTools MCP
3. Write commentary in Bylaw's voice
4. Post tweet with image attached

## History

Update `history.md` only when something happens. Log: what posted, tweet IDs, engagement numbers, ideas. Check engagement once/day via DevTools MCP snapshot of our profile.

## Algorithm Cheat Sheet

| Signal | Weight |
|--------|--------|
| Like | 1x |
| Bookmark | 10x |
| Profile click | 12x |
| Reply | 13.5x |
| Retweet | 20x |
| Self-reply thread | 150x |

Hashtags: 1-2 max (#HOA, #HOAManagement). Never start tweet with hashtag. Pin best thread, update monthly.

## Safety Rules

**NEVER:**
- Browser automation for any write action (like/reply/follow/post)
- 10+ tweets per hour
- 50+ follows per day
- Unfollow people who followed back
- 30+ likes in a rapid burst
- Duplicate text
- @-mention strangers
- Irrelevant trending hashtags
- DM anyone

**OK:**
- API for all write actions
- Browser for read-only (profile checks, search, screenshots)
- 20-30 likes/day spread out
- 10-15 follows/day
- Self-reply threads
- Reference others' content without @-mentioning
- Repost old content after 2+ weeks with new wording

## CLI

```
pnpm content:list            # Queue status
pnpm content:next            # Preview next post
pnpm content:post            # Post next from queue
pnpm content:post-text "x"   # Post custom text
pnpm content:image <img> "x" # Post with image attached
pnpm content:reply <id> "x"  # Reply to own tweet
pnpm content:quote <url> "x" # Quote tweet (currently 403)
pnpm content:thread <file>   # Post thread from JSON
pnpm content:like <id>       # Like a tweet
pnpm content:follow <user>   # Follow account
```

## Files

- `content/personality.md` — Voice guide
- `content/history.md` — Post log, engagement, ideas
- `content/posts.json` — Tweet queue
- `content/replies-queue.md` — Manual replies for creator to paste
- `content/images/` — Generated images
- `content/src/` — CLI source code
