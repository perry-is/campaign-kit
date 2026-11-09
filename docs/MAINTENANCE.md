# Maintenance watch list

What CampaignKit depends on that can change underneath it. The monthly
"anything due?" check reads this table. **Update it whenever a version changes.**

| Item | Version we use | Where it's set | Why it can force an update | Where to check |
| --- | --- | --- | --- | --- |
| Instagram (Meta Graph API) | v26.0 | connector in progress | Each Graph API version is retired about 2 years after release | https://developers.facebook.com/docs/graph-api/changelog |
| LinkedIn (versioned REST API) | 202609 | connector in progress | New version monthly; each is retired after about a year | https://learn.microsoft.com/linkedin/marketing/versioning |
| Eventbrite API | v3 | connector in progress | Occasional breaking changes and deprecations | https://www.eventbrite.com/platform/docs/changelog |
| Meetup API | GraphQL (`api.meetup.com/gql-ext`) | practice mode only | Schema changes | https://www.meetup.com/api/guide/ |
| OpenAI text model | gpt-6-luna | `src/ai/prompts.ts` (`TEXT_MODEL`) | Models are deprecated with notice | https://platform.openai.com/docs/deprecations |
| OpenAI image model (icon art) | gpt-image-2.5-sunburst | `src/ai/prompts.ts` (`ICON_IMAGE_MODEL`) | Models are deprecated with notice | https://platform.openai.com/docs/deprecations |
| OpenAI image models (posters) | gpt-image-2.5-sunburst (Best), gpt-image-2.5-flare (Fast) | `src/ai/prompts.ts` (`POSTER_MODELS`) | Models are deprecated with notice | https://platform.openai.com/docs/deprecations |
| Electron (app engine) | see `package.json` | `package.json` devDependencies | Only the 3 newest major versions get security fixes | https://releases.electronjs.org |
| macOS | current release | — | Yearly releases can break apps; test betas in summer | https://developer.apple.com/news/releases/ |

## Routine

- Monthly check (automatic): opens a GitHub issue labelled `maintenance` for anything
  due within 90 days, and sends a notification.
- Dependabot: security fixes as they appear; library updates bundled monthly.
- Before each release: run one practice event through every connector's Test button.
