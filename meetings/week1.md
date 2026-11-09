# Week 1 Meeting Deliverables

## Agenda (35min)

- **Intro/Project Summary** (5min)
  - Bad Situation
  - Solution ideas overview
  - Global thoughts/feedback
- **Issue: AI** (5min)
  - Using AI API
  - Capacity for summarizing video
- **Issue: Video Syncing** (10min)
  - Value/capacity of this feature
  - HTTP/WebSocket
- **Issue: Platform Integration** (5min)
  - YouTube => Panopto
- **Issue: Video Player** (5min)
  - Ads/Restrictions
  - Experimentation
- **Plans/Decisions** (5min)
  - Summary/suggestions

## Project Summary

### Our Bad Situation

- Context
  - Synchronous lecture/recitations let you ask questions, but not move at your own pace
  - Asynchronous recordings offer the opposite
- Rewatching lecture videos (pre-exam, study group)
  - **Overall** poor capacity for collaboration virtually
  - Centralized controls
  - Reduced video quality
  - Lost discussion context
- Comparable platforms
  - SharePlay (synced playback)
  - Watch2Gether


### Our Solution Ideas

- Live mode: shared playback
  - Integrated video player
    - YouTube or others?
  - Shared pausing/rewinding/fast-forwarding
  - Live chat
    - tied to ID/account
    - nested replies
- Historical mode: independent playback
  - Video still available
  - Discussion/chat still available for review/contribution
- AI-powered summary tool
  - Summarize discussion
  - Summarize video content?

## Issues

- **Thoughts on AI summary?**
  - We are new to using/integrating the Gemini API, so we would like to get a sense of whether AI summary of discussion (and video content) is a reasonable goal.
  - Process video?
- **How should we go about syncing video?**
  - We want to decide what the best approach is for syncing video, and whether it is worth our effort to keep this feature. We think that a WebSockets-style approach would be ideal, though we can alternatively use HTTP/polling (each has tradeoffs).
  - HTTP sufficient? polling-based updates, higher/variable latency
  - WebSockets? compatibility with sync-engine
  - Scrap/de-emphasize syncing?
- **Which platforms should we try to integrate?**
  - We’re planning to start with YouTube, and want to decide whether Panopto/other platforms is a realistic stretch goal given the work needed to integrate another player.
  - goal: MVP is YouTube
    - seems to have no usage limits
  - Is a reasonable stretch goal to integrate Panopto?
- **Dealing with integrated video player**
  - We want to get a sense of what it is like to work with an integrated YouTube player, and when/how we should explore this early on.
  - YouTube ads?

## (post-meeting) Plans and Decisions

### Decisions

- Lost discussion context is the key bad situation we want to alleviate.
- Video syncing and AI overviews are nice-to-haves.
- **Test before problem framing:** YouTube restrictions, Panopto feasibility, and (perhaps) AI credits/integration.

### Plans

- **Prioritize the bad situation of lost discussion context.**
  - Make sure discussion is well-supported, over syncing etc. features.
  - Frame a bad situation as a user journey.
  - **Make sure there is solid evidence for this bad situation in problem framing.** Why are people compelled to watch with others? What about rewatching, different playback speeds, etc.?
- **Supporting sharing**
  - Try to answer: how do we support sharing discussion/notes? Public vs. private?
- **Testing key (shaky) features.**
  - Embedding YouTube: what happens with ads? Should we block player/interactions while someone is watching an ad?
  - Panopto: **try figuring out whether Panopto is possible before problem framing.**
  - Syncing: nice-to-have, and (if we want it) we should test early.
- **AI incorporation.**
  - Note that this feature can be pushed back (post MVP).
  - Look into setting up credits.

<!-- 
- focus more on supporting discussion (bad situation that arises with discussion)
- bad situation = user journey (alleviated by user journey)
- video quality (downloading video)
- don't put too much effort on engineering
- public/private discussion => emphasize how it's better than public commenting

- ai summary on request
- can push back
- look into incorporating AI

- start testing on syncing early
- test deployed (can create own site on 6.1040 apps)

- embedding Panopto: Panopto API? authentication?
- Panopto embed API

- test AD interactions
- block interactions while someone is frozen by ad

- problem framing: emphasize evidence
- Panopto: do i want a watch party? what if i want 2x speed? why am i compelled to watch with others?
- what if want to watch twice with two different groups?

- check by next meeting: panopto. put in problem frame 

plans for next week and decisions made -->