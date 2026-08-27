import { useState } from 'react'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/Button'
import { useAppData } from '../../hooks/useAppData'
import { useWorkspaces } from '../../hooks/useWorkspaces'

export function InviteModal({ onClose }: { onClose: () => void }) {
  const { players, workspace, workspaceMembers, updateWorkspaceMemberRole } = useAppData()
  const { createPlayerInvite, rotateWorkspaceCode, revealedPlayerInvite, clearRevealedPlayerInvite, revealedCode, isSaving } = useWorkspaces()
  const [playerId, setPlayerId] = useState('')
  const [tab, setTab] = useState<'PLAYER' | 'HOST'>('PLAYER')
  const [error, setError] = useState('')
  const unlinkedPlayers = players.filter((player) => !player.archivedAt && !player.userId)

  function close() {
    clearRevealedPlayerInvite()
    onClose()
  }

  return (
    <Modal title={`Invite to ${workspace.name}`} onClose={close}>
      <div className="segmented-grid grid-cols-2">
        {(['PLAYER', 'HOST'] as const).map((item) => (
          <label key={item} className="segmented-option"><input className="sr-only" type="radio" checked={tab === item} onChange={() => setTab(item)} /><span>Invite {item === 'PLAYER' ? 'Player' : 'Host'}</span></label>
        ))}
      </div>
      {tab === 'PLAYER' ? (
        <div className="mt-6">
          {revealedPlayerInvite ? (
            <CodeResult
              label="Player invite"
              name={revealedPlayerInvite.playerNickname ?? 'New registered player'}
              code={revealedPlayerInvite.inviteCode}
              note={revealedPlayerInvite.playerId
                ? 'Links this account to the selected player and preserves all history. Single-use · expires in 14 days.'
                : 'The invited user chooses a new poker nickname after redemption. Single-use · expires in 14 days.'}
            />
          ) : (
            <>
              <p className="text-sm font-bold text-ink">Link existing player</p>
              <label className="mt-3 block"><span className="label">Guest player</span><select className="input" value={playerId} onChange={(event) => setPlayerId(event.target.value)}><option value="">Choose player</option>{unlinkedPlayers.map((player) => <option key={player.id} value={player.id}>{player.nickname} · Guest</option>)}</select></label>
              <p className="mt-3 text-xs leading-5 text-ink-muted">Links the registered account to this exact Player, preserving history and statistics.</p>
              <Button fullWidth className="mt-4" disabled={!playerId || isSaving} onClick={() => void createPlayerInvite(workspace.id, playerId)}>{isSaving ? 'Generating…' : 'Generate linked Player code'}</Button>
              <div className="mt-6 border-t border-line pt-5"><p className="text-sm font-bold text-ink">New registered player</p><p className="mt-2 text-xs leading-5 text-ink-muted">No Player is created yet. The invited user chooses a unique poker nickname after joining. Players already marked Registered are not eligible for another identity.</p><Button variant="secondary" fullWidth className="mt-3" disabled={isSaving} onClick={() => { setError(''); void createPlayerInvite(workspace.id).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to create invite.')) }}>Generate new Player code</Button></div>
              {error ? <p role="alert" className="mt-3 text-sm text-red-300">{error}</p> : null}
            </>
          )}
        </div>
      ) : (
        <div className="mt-6">
          {revealedCode?.workspaceId === workspace.id ? (
            <CodeResult label="Host access" name={workspace.name} code={revealedCode.code} note="Host access can manage sessions and Plans. The code is shown only after creation or rotation." />
          ) : (
            <>
              <p className="text-sm leading-6 text-ink-secondary">Host codes are not stored in readable form. Rotate the code to reveal a new one; the previous code stops working immediately.</p>
              <Button variant="secondary" fullWidth className="mt-4" disabled={isSaving} onClick={() => void rotateWorkspaceCode(workspace.id)}>Rotate & reveal Host code</Button>
            </>
          )}
        </div>
      )}
      {workspaceMembers.length > 1 ? <div className="mt-7 border-t border-line pt-5"><p className="section-label">Members</p><div className="mt-3 divide-y divide-line/60">{workspaceMembers.map((member) => <div key={member.userId} className="flex min-h-14 items-center justify-between gap-3 py-2"><div className="min-w-0"><p className="truncate text-sm font-bold text-ink">{member.displayName ?? (member.role === 'HOST' ? 'Guest host' : 'Registered player')}</p><p className="text-[11px] text-ink-muted">{member.role}</p></div>{member.role !== 'OWNER' ? <select aria-label={`Role for ${member.displayName ?? 'member'}`} className="min-h-10 rounded-lg border border-line bg-black/30 px-2 text-xs font-bold text-ink" value={member.role} onChange={(event) => void updateWorkspaceMemberRole(member.userId, event.target.value as 'HOST' | 'PLAYER')}><option value="PLAYER">Player</option><option value="HOST">Host</option></select> : <span className="text-xs font-bold text-ink-muted">Owner</span>}</div>)}</div></div> : null}
    </Modal>
  )
}

function CodeResult({ label, name, code, note }: { label: string; name: string; code: string; note: string }) {
  return <div className="text-center"><p className="section-label">{label}</p><p className="mt-2 font-bold text-ink">{name}</p><p className="mt-5 text-4xl font-black tracking-[0.18em] text-ink">{code.slice(0, 3)} {code.slice(3)}</p><Button variant="secondary" className="mt-5" onClick={() => void navigator.clipboard.writeText(code)}>Copy code</Button><p className="mt-4 text-xs leading-5 text-ink-muted">{note}</p></div>
}
