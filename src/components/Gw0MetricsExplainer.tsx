export function Gw0MetricsExplainer() {
  return (
    <section className="fpl-gw0-explain">
      <h2 className="fpl-explorer__title">How the solver metrics are derived</h2>
      <p className="fpl-explorer__meta">
        All figures are as-of-GW0. They do not update for injuries or price changes after GW1. Phase 0 GW1 RMSE
        is about 2.7 pts per player — these are candidate squads, not a unique best team.
      </p>
      <dl className="fpl-gw0-explain__list">
        <div>
          <dt>What the MILP maximises</dt>
          <dd>
            Short-term: Σ x<sub>p</sub> E[pts<sub>p</sub>, GW1]. Long-term: Σ x<sub>p</sub> Σ<sub>g=1..6</sub> E[pts<sub>p</sub>, g]
            with equal GW weights. Constraints are the official 15, £100.0m, 2 GK / 5 DEF / 5 MID / 3 FWD, max 3 per
            club. Captain doubling is a post-solve suggestion, not part of the 15-man objective. EPPM and official{' '}
            <code>ep_next</code> are display-only.
          </dd>
        </div>
        <div>
          <dt>E[pts] (Approach A)</dt>
          <dd>
            Prior-season FPL points/90, shrunk toward the positional baseline, then transfers discounted (
            <code>k_trans</code> = 0.75). For each GW:{' '}
            <code>E[pts] = (adj_p90 / 90) × E[minutes] × FDR_factor</code>. GW2–GW6 reuse the same rate prior with that
            GW’s fixtures only.
          </dd>
        </div>
        <div>
          <dt>E[minutes]</dt>
          <dd>
            Shrunk prior start-rate × 90, then RoleEvidence <code>m_sem</code> (start / change / unreviewed) and{' '}
            <code>m_fitness</code> from official status / chance of playing. Unavailable players are dropped before
            the LP.
          </dd>
        </div>
        <div>
          <dt>FDR factor</dt>
          <dd>
            Official fixture difficulty, multiplicative tables from Phase 0. MID/FWD use the attack table; DEF blends
            attack and clean-sheet 50/50; GK 30/70. Not a live team-strength model.
          </dd>
        </div>
        <div>
          <dt>Who is “considered”</dt>
          <dd>
            The LP pool after the quantitative funnel (position EP floors, top-quartile EPPM within position, or a
            high prior-minutes share). Charts below plot that pool, not the full ~500-player snapshot.
          </dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>
            A separate 0–1 label from minutes sample, external flags, and club stability. It is not a second
            expected-points number and the solver does not maximise it.
          </dd>
        </div>
      </dl>
    </section>
  )
}
