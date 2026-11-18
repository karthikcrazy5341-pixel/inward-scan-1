# Inward Scan on Netlify: setup guide

You need: a free GitHub account, a Netlify account, and about 20 minutes.
No coding and no command line needed.

## What is in this folder

- public/index.html   the page people see (login and scanning screen)
- src/app.js          the page logic (Netlify builds it into public/app.js)
- netlify/functions/api.mjs   the backend. It checks who is logged in and saves scans.
- package.json, netlify.toml  tell Netlify how to build the project

Logins: Netlify Identity. Scans, lists and delete history: Netlify Blobs.
Dates and the "Today" totals use India time (IST).

## Step 1. Put the files on GitHub

1. Sign in at github.com and click New repository. Name it inward-scan. Keep it Private. Click Create.
2. On the empty repository page click "uploading an existing file".
3. Unzip this project on your computer. Open the unzipped folder, select EVERYTHING inside it
   (including the netlify and src and public folders) and drag it into the GitHub page.
   Important: the files must sit at the top level of the repository, not inside an extra folder.
4. Click Commit changes.

Check: the repository front page should list netlify, public, src, package.json, netlify.toml.

## Step 2. Create the site on Netlify

1. Sign in at app.netlify.com.
2. Add new project, then Import an existing project, then GitHub. Allow access and pick inward-scan.
3. Leave the settings as they are. Netlify reads netlify.toml:
   build command: npm run build, publish folder: public.
4. Click Deploy. Wait until it says Published. Open the site link. You will see the sign in page.
   You cannot sign in yet. Do Step 3 first.

## Step 3. Turn on logins (Identity)

1. In your Netlify project go to Project configuration, then Identity, and click Enable Identity.
2. In Identity, Registration, set Registration preferences to Invite only. This stops strangers
   from creating accounts.
3. Redeploy once if Netlify asks you to (Deploys, Trigger deploy).

## Step 4. Create your admin account

1. Identity, Users, Invite users. Enter your own email and send.
2. Open the invite email and click the link. It opens your site and asks you to choose a password.
3. Back in Netlify: Identity, Users, click your user, edit settings, and add the role: admin
   (lowercase, exactly "admin").
4. In the app click Sign out, then sign in again. Roles only update on a new login.
   You should now see "Signed in as ... (Admin)" and the boxes to add LSPs and marketplaces.

## Step 5. Add your team

For each scanner: Identity, Users, Invite users, enter their email.
They click the link, choose a password, and they are Scanners (no admin role).
To make someone an admin, give them the role admin the same way as in Step 4.
Forgot password: they use the Forgot password button on the sign in page.
You can also send a reset email from the user page in Netlify.

## Step 6. First use

1. Sign in as admin. Add your LSPs and marketplaces (one per line or comma separated).
2. Pick LSP, marketplace and status, click the big box, scan or type an AWB, press Enter.
3. A duplicate AWB shows a red message. Admins can delete a scan from "Last 20 scans";
   deletes are kept in Deleted history.

## Things to know

- Test on the live Netlify link. Identity does not work on your own computer.
- Your old data in the Claude artifact is NOT moved over. This starts empty.
  If you need the old scans, export them from the old page first.
- The page loads scans from today and yesterday. Download CSV exports any one day.
- To change anything later, edit the file on GitHub. Netlify redeploys by itself.
- package.json uses "latest" for the three libraries, so Netlify installs the newest versions
  on each build. If a future update ever breaks the build, tell me the error text from
  Deploys on Netlify and I will fix it.

## If something goes wrong

- Page says it cannot sign in or invite link fails: check Identity is enabled (Step 3) and
  you opened the link on the same site address.
- Admin boxes missing: the admin role is missing, or you did not sign out and in again.
- Blank page: in Netlify open Deploys, click the latest deploy and read the build log.
- "Server error" when scanning: Netlify, Logs, Functions, open the api function log.
