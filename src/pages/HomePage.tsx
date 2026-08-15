import './HomePage.css'

/**
 * Product home for the installable FPL shell.
 * Explorer screens and live data belong to later tickets.
 */
export function HomePage() {
  return (
    <div className="fpl-home">
      <div className="fpl-home__atmosphere" aria-hidden="true">
        <div className="fpl-home__pitch" />
      </div>

      <section className="fpl-home__hero" aria-labelledby="fpl-brand">
        <p className="fpl-home__kicker">Installable PWA</p>
        <h1 className="fpl-home__brand" id="fpl-brand">
          FPL Decision Support
        </h1>
        <p className="fpl-home__lead">
          Weekly Fantasy Premier League decisions — who to consider, who to
          captain, keep versus sell — with the reasoning, not only the ranks.
        </p>
        <p className="fpl-home__note">
          This is the product shell: shared chrome, theme, and install
          infrastructure. Gameweek, player, and fixture explorers come next.
        </p>
      </section>
    </div>
  )
}
