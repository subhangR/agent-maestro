import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFirebaseAuthStore } from '../stores/useFirebaseAuthStore';
import { getGatewayAuthToken } from '../utils/gatewayAuth';
import { GatewayPresence, useGatewayPresenceFeed } from '../firebase/gatewayPresence';
import { Icon, Mark } from './maestro/redesign/kit';

interface GatewayMember {
  email: string;
  uid: string | null;
  workspaceStatus: string;
  liveAgentCount: number;
}

interface GatewayOverview {
  generatedAt: number;
  members: GatewayMember[];
}

function nameFor(member: GatewayMember, presence?: GatewayPresence): string {
  return presence?.displayName?.trim() || member.email.split('@')[0] || member.email;
}

function initials(name: string): string {
  return name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
}

/** Gateway-owned team control centre. Its data never comes from a member instance. */
export function GatewayDashboard() {
  const currentUser = useFirebaseAuthStore((state) => state.user);
  const presence = useGatewayPresenceFeed();
  const [overview, setOverview] = useState<GatewayOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const token = await getGatewayAuthToken();
      const response = await fetch('/gateway/api/overview', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) throw new Error(`Gateway overview is unavailable (${response.status})`);
      setOverview(await response.json() as GatewayOverview);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gateway overview is unavailable.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const members = overview?.members ?? [];
  const onlineCount = useMemo(
    () => members.filter((member) => member.uid && presence[member.uid]).length,
    [members, presence],
  );
  const liveAgentCount = useMemo(
    () => members.reduce((total, member) => total + member.liveAgentCount, 0),
    [members],
  );

  return (
    <main className="gatewayDashboard">
      <header className="gatewayDashboard__header">
        <a className="gatewayDashboard__brand" href="/" aria-label="Open my Maestro workspace">
          <Mark size={25} /><span>MAESTRO</span><span className="gatewayDashboard__brandSlash">/</span><span className="gatewayDashboard__brandGateway">GATEWAY</span>
        </a>
        <a className="gatewayDashboard__workspaceLink" href="/"><Icon name="arrowRight" size={15} />Open my workspace</a>
      </header>

      <section className="gatewayDashboard__intro">
        <div>
          <p className="gatewayDashboard__eyebrow">TEAM CONTROL CENTRE</p>
          <h1>Your team, live on one Maestro.</h1>
          <p>See who is here and how many agents are currently working.</p>
        </div>
        <button className="gatewayDashboard__refresh" type="button" onClick={() => void refresh()} disabled={refreshing}>
          <Icon name="refresh" size={15} />{refreshing ? 'Refreshing' : 'Refresh'}
        </button>
      </section>

      <section className="gatewayDashboard__metrics" aria-label="Gateway summary">
        <div className="gatewayDashboard__metric"><span className="gatewayDashboard__metricValue">{onlineCount}</span><span>online now</span></div>
        <div className="gatewayDashboard__metric"><span className="gatewayDashboard__metricValue">{liveAgentCount}</span><span>agents working</span></div>
        <div className="gatewayDashboard__metric"><span className="gatewayDashboard__metricValue">{members.length}</span><span>team members</span></div>
      </section>

      <section className="gatewayDashboard__members" aria-labelledby="gateway-members-title">
        <div className="gatewayDashboard__sectionHeading">
          <div><p className="gatewayDashboard__eyebrow">TRUSTED TEAM</p><h2 id="gateway-members-title">Members</h2></div>
          {currentUser?.email && <span className="gatewayDashboard__signedIn">Signed in as {currentUser.email}</span>}
        </div>

        {error ? <div className="gatewayDashboard__notice" role="alert">{error}</div> : members.length === 0 ? <div className="gatewayDashboard__notice">Loading the team roster…</div> : (
          <div className="gatewayDashboard__memberGrid">
            {members.map((member) => {
              const memberPresence = member.uid ? presence[member.uid] : undefined;
              const online = Boolean(memberPresence);
              const name = nameFor(member, memberPresence);
              return (
                <article className="gatewayDashboard__member" key={member.email}>
                  <div className="gatewayDashboard__avatar" aria-hidden="true">
                    {memberPresence?.photoURL ? <img src={memberPresence.photoURL} alt="" /> : initials(name)}
                    <span className={`gatewayDashboard__presence ${online ? 'gatewayDashboard__presence--online' : ''}`} />
                  </div>
                  <div className="gatewayDashboard__memberIdentity"><h3>{name}</h3><p>{member.email}</p></div>
                  <div className="gatewayDashboard__memberStats"><span className={online ? 'gatewayDashboard__onlineText' : ''}>{online ? 'Online' : 'Offline'}</span><strong>{member.liveAgentCount} {member.liveAgentCount === 1 ? 'agent' : 'agents'} working</strong></div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
