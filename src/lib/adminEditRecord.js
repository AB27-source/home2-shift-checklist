// Module-level singleton for passing an admin-edit record to StaffDashboard.
// Using a plain JS variable (not React state/props) means it survives
// React StrictMode's double-invocation of useState initializers.
let _record = null;

export function setAdminEditRecord(r)  { _record = r; }
export function getAdminEditRecord()   { return _record; }
export function clearAdminEditRecord() { _record = null; }
