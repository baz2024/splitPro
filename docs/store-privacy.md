# Safi: store privacy answers (App Store "App Privacy" and Google Play "Data safety")

Source of truth: `src/pages/privacy.tsx`. If the privacy policy changes, update this file and
both store forms together.

## What Safi collects

Safi has **no ads, no analytics SDK, no crash-reporting SDK and no tracking**. Data is only used
to run the app. Everything is sent over HTTPS. Users can delete their account in the app
(Account → Delete account) or at https://safi.kafoai.com/delete-account.

| Data                         | When                                         | Required? |
| ---------------------------- | -------------------------------------------- | --------- |
| Name                         | Sign-in (Apple / Google) or profile          | Yes       |
| Email address                | Email or Apple / Google sign-in              | Optional  |
| Phone number                 | Phone sign-in; numbers of people you invite  | Optional  |
| Expenses, amounts, notes     | Core feature                                 | Yes       |
| Bank transactions            | Only if you link a bank (GoCardless / Plaid) | Optional  |
| Photos (receipts)            | Only when you scan or attach a receipt       | Optional  |
| Other users' names / numbers | Friends and group members you add            | Optional  |
| Device push token            | Only if notifications are turned on          | Optional  |
| User ID                      | Account                                      | Yes       |

Receipt photos are sent to Anthropic only after the in-app consent screen. Exchange-rate
services receive currency codes and dates only.

## App Store Connect → App Privacy

- Do you or your third-party partners collect data? **Yes**
- Tracking: **No** for every type. Linked to the user: **Yes** for every type.
- Purpose for every type: **App Functionality** only.

| Category       | Type                 | Linked | Tracking |
| -------------- | -------------------- | ------ | -------- |
| Contact Info   | Name                 | Yes    | No       |
| Contact Info   | Email Address        | Yes    | No       |
| Contact Info   | Phone Number         | Yes    | No       |
| Financial Info | Other Financial Info | Yes    | No       |
| User Content   | Photos or Videos     | Yes    | No       |
| User Content   | Other User Content   | Yes    | No       |
| Identifiers    | User ID              | Yes    | No       |

Not collected: Health, Location, Contacts (address book), Browsing/Search History, Usage Data,
Diagnostics, Purchases, Sensitive Info, Device ID, Payment Info, Credit Info.

Privacy policy URL: `https://safi.kafoai.com/privacy`.

## Google Play → Data safety

- Collects or shares required user data types: **Yes**
- All data encrypted in transit: **Yes**
- Users can request deletion: **Yes** — URL `https://safi.kafoai.com/delete-account`
- Shared with third parties: **No** (service providers acting for Safi are not "sharing" under
  Play's definition).

Collected (purpose **App functionality** and **Account management** where it is an account
field; processed ephemerally: **No**):

| Category            | Type                 | Required / optional |
| ------------------- | -------------------- | ------------------- |
| Personal info       | Name                 | Required            |
| Personal info       | Email address        | Optional            |
| Personal info       | Phone number         | Optional            |
| Personal info       | User IDs             | Required            |
| Financial info      | Other financial info | Required            |
| Photos and videos   | Photos               | Optional            |
| App info and perf   | —                    | Not collected       |
| Device or other IDs | —                    | Not collected       |

Not collected: Location, Health, Messages, Audio, Files and docs, Calendar, Contacts (address
book), App activity, Web browsing, Purchase history, Credit score.

## App access (review login)

Play Console → App content → App access: **All or some functionality is restricted**.
App Store Connect → App Review Information → Sign-in required: **Yes**.

> Sign in with phone number **+353 87 000 0101** and the SMS code **[review code]** (test number, no
> SMS is sent; valid until 31 Dec 2026). On the Welcome screen choose "Continue with phone".
> Then: create a group, add a cost (Add → amount → split), open Balances, settle up. "Scan"
> reads a receipt with AI after a one-time consent screen. Account → Delete account removes the
> account. Notifications are optional.

Replace `[review code]` with the fixed code before pasting; it is kept out of the repo and can be
read in Supabase → Authentication → Phone → Test Phone Numbers. The number is set by
`tool/set_review_phone.sh` (Supabase Auth → Test Phone Numbers). Renew it
before 31 Dec 2026 by running the script with `REVIEW_CODE` and a new `REVIEW_VALID_UNTIL`, then update this text.
