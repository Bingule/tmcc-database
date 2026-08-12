# GitHub Pages deployment

This project is configured for GitHub Pages with GitHub Actions.

## First-time setup

1. Create a GitHub repository, for example `tmcc-database`.
2. Push this folder to the repository's `main` branch.
3. In GitHub, open `Settings > Pages`.
4. Under `Build and deployment`, set `Source` to `GitHub Actions`.
5. Open the `Actions` tab and run `Deploy to GitHub Pages`, or push to `main`.

The project-page URL will look like:

```text
https://<your-github-username>.github.io/tmcc-database/
```

For a custom domain later, add the domain in `Settings > Pages` and update DNS at the domain provider.
