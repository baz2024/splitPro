# Safi: App Store and Google Play submission audit

Date: 12 November 2026. Scope: the native shell in `mobile/` plus the web app it loads
(https://safi.kafoai.com), in English and Arabic, at phone size (375×812).

## Pending work found

- No open pull requests or issues on GitHub.
- Only unmerged branch: `worktree-graphify-install` (developer tooling, not part of the app).
- Code TODOs: three "move to app router" notes. None block a release.

## Fixed in this change

| Area                                           | Problem                                                         | Fix                                                                                                      |
| ---------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Account deletion (Apple 5.1.1(v), Play policy) | No way to delete an account                                     | Account → Delete account, with a confirm step. Public page at `/delete-account` for the Play Console URL |
| AI disclosure (Apple 5.1.2(i))                 | Receipt photos went to Anthropic without asking                 | One-time consent screen before the first scan; "Don't allow" switches to manual entry                    |
| Privacy policy                                 | Dated 2022, said "Splitpro", claimed no third-party sharing     | Rewritten: every provider, AI use, deletion, no tracking                                                 |
| Terms                                          | Said "Splitpro"                                                 | Safi / Kafo AI, AI accuracy note, deletion path                                                          |
| Add cost screen                                | "Next: split" covered the keypad's bottom row (Fleck: critical) | Amount block shrinks on phones under 860pt, so the keypad fits                                           |
| Download data                                  | Blob link can't save inside the iOS app                         | Uses the app's share-sheet bridge; file renamed `safi_data.json`                                         |
| Feedback button                                | Never showed (prop name mismatch)                               | Fixed                                                                                                    |
| "Download app" (PWA)                           | Shown inside the native app                                     | Hidden when running in the Safi app                                                                      |
| Branding                                       | Invite text "in Splitpro"                                       | "in Safi"                                                                                                |
| Arabic                                         | One missing string (`errors.create_group_failed`)               | Added; Arabic now has every English key                                                                  |
| Legal links                                    | Not on the native Welcome screen or in Account                  | Added to both, 44pt targets, EN/AR                                                                       |
| iOS privacy manifest                           | Missing                                                         | `ios.privacyManifests` in `mobile/app.json`                                                              |
| Android release                                | No build or submit profile                                      | App bundle build + Play internal track submit in `mobile/eas.json`                                       |
| Docs                                           | README said "not an App Store release"                          | Store submission steps added                                                                             |

How deletion works: sign-in links, sessions, push subscriptions, API keys, bank and billing
connections and detected subscriptions are deleted. The profile is anonymised to
"Deleted user". Expenses shared with others stay, so their balances remain correct.
Verified locally: user anonymised, 0 sessions left, 120 shared expenses kept.

## You need to do these (outside the code)

1. **Deploy the web app** to safi.kafoai.com. The native app shows the live site, so reviewers
   only see these fixes after the deploy.
2. **Set `SUPABASE_SERVICE_ROLE_KEY`** in Vercel (server-only). Without it, deletion leaves the
   Supabase sign-in record behind (it no longer links to any Safi data).
3. **Create a review account.** Add a Supabase test phone number with a fixed code, give it some
   sample expenses, and put the details in App Review Notes and Play Console → App access.
4. **Store forms:** App Store privacy labels and Play Data safety must match the new privacy
   policy. Play account-deletion URL: `https://safi.kafoai.com/delete-account`.
5. **Google Play:** save the service-account key as `mobile/google-service-account.json` and do
   the first upload by hand in Play Console.
6. **New native build:** the privacy manifest and Welcome links need a fresh EAS build.
7. **Terms → Governing law** still says "US". Confirm Kafo AI's jurisdiction.

## Remaining risks

- **Guideline 4.2 (minimum functionality).** The app is a WebView around the website. Native
  parts: Apple/Google/phone sign-in, share sheet, camera, offline retry. Adding native push
  notifications would lower the rejection risk most.
- **Fleck design review (Add cost, 68/100):** "Scan" sits in the same switch as cost types;
  grey labels are low contrast on navy; "Next: split" suggests every cost must be split.
- **Small phones (iPhone SE, 667pt):** the keypad still needs a short scroll.
- **Arabic:** the multi-currency total on Balances can wrap with a "+" at the start of a line.
  Currency symbols show as "UK£" / "US$" (standard Arabic formatting).
- `npx expo-doctor`: 11 Expo packages are one patch version behind.
- The shared confirm dialog's buttons are smaller than 44pt.

## UI references used

- Fleck UX audit of Add cost (design review).
- Mobbin: Lightyear and talabat amount keypads (CTA below a fully visible keypad);
  Lightyear, Neo Financial and Copilot account screens (red "Close account" at the end of
  settings, with a confirm dialog).
