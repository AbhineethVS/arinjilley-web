// The site moved from arinjilley.arinjilley-bot.workers.dev to arinjilley.pages.dev on 17 Oct 2026.
// This tiny Worker keeps the old address alive so links that were already shared still work.
export default {
  fetch(request: Request): Response {
    const url = new URL(request.url);
    return Response.redirect(`https://arinjilley.pages.dev${url.pathname}${url.search}`, 301);
  },
};
