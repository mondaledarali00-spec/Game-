# Push this repository to GitHub

Everything is already laid out as a repository — no files need moving. Pick one of the two routes.

---

## Route A — upload the folder as-is (no git experience needed)

1. On GitHub: **New repository** → name it e.g. `towfik-youtube` → **do not** add a README, .gitignore or license
   (this folder already has them) → **Create repository**.
2. On the empty repo page choose **uploading an existing file**.
3. Drag in the *contents* of this folder (not the folder itself), or use
   `gh`/PowerShell if the browser struggles with 1,500 files:

   ```bash
   gh repo create towfik-youtube --public --source=. --remote=origin --push
   ```

   GitHub's web uploader handles a few hundred files comfortably; for this many files the git route below is
   much more reliable.

---

## Route B — git (recommended)

```bash
cd towfik-youtube

git init
git add .
git commit -m "Towfik Youtube — liquid glass build of Litube 4.0.0"
git branch -M main

# create the empty repo on github.com first, then:
git remote add origin https://github.com/<YOUR-USER>/<YOUR-REPO>.git

# GitHub no longer accepts an account password here. Use a Personal Access Token
# (Settings → Developer settings → Personal access tokens → Fine-grained, "Contents: Read and write")
# as the password when prompted.
git push -u origin main
```

If your default branch has to be something else, use `git branch -M <name>` before pushing.

---

## Optional — attach the APK to a Release instead of committing it

Recommended for a public repo, so the binary does not sit in git history:

1. Delete the `dist/` folder and remove the `!dist/*.apk` block from `.gitignore`.
2. Push.
3. On GitHub: **Releases → Draft a new release** → tag `v4.0.0-liquidglass` → attach
   `Towfik-Youtube-4.0.0-LiquidGlass-Everywhere-v5.apk` → publish.

---

## Before you push — three things to keep in mind

1. **Never commit signing material.** The release keystore and its password file are *not* in this folder, and
   `.gitignore` blocks `*.keystore`, `*.jks`, `keystore.properties` and `*.pass`. Keep it that way: anyone with
   that file can publish updates that Android will accept as yours.
2. **`local.properties` is excluded on purpose** — it contains your machine's SDK path. Create it locally to
   build (`echo "sdk.dir=/path/to/Android/Sdk" > local.properties`).
3. **License.** Upstream Litube is GPL-3.0, so this derived repository must stay GPL-3.0 and must keep the
   license text, the attribution in `NOTICE.md`, and the modified sources available — which a public repo does.
   Do not relicense it as MIT/Apache, and do not publish it as closed source.

## What is in the box

| Path | Contents |
|---|---|
| `app/` | full Gradle project source (Kotlin, Compose), edited |
| `docs/CHANGE_REPORT.md` | every change, every revision, including the two bugs found and fixed |
| `docs/design-preview.html` | animated light/dark preview of the glass design |
| `docs/screenshots/` | device screenshots, the style reference, and labelled bug evidence |
| `docs/UPSTREAM_README.md` | the original Litube README, kept for reference |
| `assets/icon/` | 512 px icon, light/dark previews, adaptive XML, all launcher densities |
| `dist/` | signed release APK + checksums |
| `NOTICE.md` | GPL-3.0 modification notice |
| `LICENSE` | GPL-3.0, unchanged from upstream |
