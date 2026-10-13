import React from 'react';
import { LuGitBranch } from 'react-icons/lu';

// Shown right after login when the user can work in more than one branch.
// The rest of the app is not rendered until a branch is chosen, so every page loads against it.
const BranchPicker = ({ branches, currentId, onPick, onLogout, onClose }) => (
  <div className="branch-picker-overlay" role="dialog" aria-modal="true" aria-labelledby="branch-picker-title">
    <div className="branch-picker">
      <LuGitBranch className="branch-picker-icon" aria-hidden="true" />
      <h2 id="branch-picker-title">Select a branch</h2>
      <p>Everything you see and create will belong to the branch you choose.</p>
      <div className="branch-picker-list">
        {branches.map((b) => (
          <button
            key={b.id}
            type="button"
            className={`branch-picker-item ${String(b.id) === String(currentId) ? 'current' : ''}`}
            onClick={() => onPick(b.id)}
          >
            <span>{b.name}</span>
            <small>
              {String(b.id) === String(currentId) ? 'Current' : ''}
              {String(b.id) === String(currentId) && (b.is_default || !b.is_active) ? ' · ' : ''}
              {b.is_default ? 'Main' : ''}
              {b.is_default && !b.is_active ? ' · ' : ''}
              {!b.is_active ? 'Inactive (read-only)' : ''}
            </small>
          </button>
        ))}
      </div>
      {onClose ? (
        <button type="button" className="branch-picker-logout" onClick={onClose}>Cancel</button>
      ) : (
        <button type="button" className="branch-picker-logout" onClick={onLogout}>Sign out</button>
      )}
    </div>
  </div>
);

export default BranchPicker;
