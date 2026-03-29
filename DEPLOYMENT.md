# GitHub Pages Deployment Guide

## ✅ What's Been Done

1. **Updated `next.config.ts`** — Enabled static export mode (`output: "export"`)
2. **Built the app** — `npm run build` created static files in the `out/` folder
3. **Created GitHub Actions workflow** — `.github/workflows/deploy.yml` automates deployment on every push to `main`

## 🚀 Next Steps

### 1. **Push to GitHub**
```bash
git add .
git commit -m "Setup GitHub Pages deployment"
git push origin main
```

### 2. **Enable GitHub Pages in Repository Settings**

Go to your GitHub repo → **Settings** → **Pages**:

- **Source:** Select "GitHub Actions" (not "Deploy from a branch")
- This tells GitHub to use the workflow we created
- GitHub Pages will automatically deploy the `out/` folder after each successful build

### 3. **Wait for Deployment**

- Go to your repo → **Actions** tab
- Watch the `Deploy to GitHub Pages` workflow run
- Once complete (green checkmark), your site is live at:
  ```
  https://<username>.github.io/<repo-name>/
  ```

## 📋 How It Works

Every time you push to the `main` branch:

1. GitHub Actions **builds** the app with `npm run build`
2. Static files are created in `out/` folder
3. Files are automatically **deployed** to GitHub Pages
4. Your site updates instantly ✨

## 🔧 Local Testing

To test the static build locally before pushing:

```bash
npm run build
npx http-server out -p 3000
```

Then visit `http://localhost:3000` to see how it looks on GitHub Pages.

## 📝 Notes

- Repository must be **public** for free GitHub Pages hosting
- Custom domain? Add a `CNAME` file in the `public/` folder with your domain
- If your repo is a project (not user/org page), the base path is `/repo-name/`
  - The workflow handles this automatically

---

**Status:** Ready to deploy! Just push to main and watch the magic happen. 🎉
