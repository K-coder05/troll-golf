# The Admin is secret, and admin code ships only to the Admin

The Admin plays as an ordinary Player, and nobody else knows who it is during a game. The reveal is saved for the optional Troll Recap. To keep it hidden, the admin UI is built as a separate JS bundle. The server sends it only to a session that authenticated with the admin secret (an env var), and the `isAdmin` flag is never synced to other clients. Every Admin Power has a Stealth form that reuses the visuals of natural events, Loud banners say only "Golf Gods", and God Mode in Stealth shows up as a Shield pop.

## Considered Options

- **Known "Golf God" role**: would have cut M3 roughly in half (no separate bundle, no Stealth variants). We rejected it because the joke depends on friends not knowing.

## Consequences

- Any new Admin Power needs a believable Stealth form. If something would expose the Admin (for example, an ability that visibly does nothing to one ball), it needs a cover story.
- Hiding admin code from someone using DevTools is a nice-to-have, not a requirement for M3.
- In scoring and Standing, the Admin is an ordinary Player. Leaving them out would give them away.
