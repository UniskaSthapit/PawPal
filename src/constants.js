// Shared vocabulary for roles, pet availability and the adoption workflow.

// Roles: "user" is an adopter (kept as "user" so existing accounts keep working).
const ROLES = ['user', 'staff', 'admin'];
const ROLE_LABELS = { user: 'Adopter', staff: 'Shelter staff', admin: 'Administrator' };

const PET_TYPES = ['Dog', 'Cat', 'Rabbit', 'Guinea Pig', 'Hamster', 'Bird', 'Reptile', 'Fish', 'Farm Animal', 'Other'];
// Suggested adoption fees (AUD) by species — staff can change each pet's fee on the pet form
const DEFAULT_FEES = { Dog: 400, Cat: 180, Rabbit: 90, 'Guinea Pig': 50, Hamster: 25, Bird: 70, Reptile: 130, Fish: 20, 'Farm Animal': 300, Other: 50 };
// Groups used by the species filters (?type=small etc.). Any other value matches a single type, e.g. ?type=reptile.
const TYPE_GROUPS = { small: ['Rabbit', 'Guinea Pig', 'Hamster', 'Other'], farm: ['Farm Animal'] };
const PET_SIZES = ['Small', 'Medium', 'Large'];
const PET_STATUSES = ['Available', 'On Hold', 'Adopted', 'Draft', 'Archived'];
const PUBLIC_PET_STATUSES = ['Available', 'On Hold'];

// Adoption workflow — ordered happy path, plus the terminal states
const APP_FLOW = ['Submitted', 'Under Review', 'Interview', 'Meet & Greet', 'Approved', 'Adoption Scheduled', 'Adopted'];
const APP_STATUSES = ['Submitted', 'Under Review', 'Info Requested', 'Interview', 'Meet & Greet', 'Approved',
  'Adoption Scheduled', 'Adopted', 'Declined', 'Withdrawn'];
const APP_CLOSED = ['Adopted', 'Declined', 'Withdrawn'];
const APP_NEEDS_DATE = ['Interview', 'Meet & Greet', 'Adoption Scheduled'];
// While an applicant is this far along, the pet is held for them
const APP_HOLDS_PET = ['Meet & Greet', 'Approved', 'Adoption Scheduled'];

// What each status means to the adopter (shown on the timeline and in emails)
const APP_STATUS_INFO = {
  Submitted: 'Your application has reached the shelter team.',
  'Under Review': 'A member of the shelter team is reading your application.',
  'Info Requested': 'The shelter needs a little more information from you before continuing.',
  Interview: 'A short phone or video chat so the team can get to know you.',
  'Meet & Greet': 'Come and meet your potential new companion in person.',
  Approved: 'Your application has been approved — the team will arrange the adoption with you.',
  'Adoption Scheduled': 'Your go-home day is booked.',
  Adopted: 'Adoption complete. Welcome home!',
  Declined: 'The shelter could not proceed with this application.',
  Withdrawn: 'You withdrew this application.',
};

// Records created before the workflow was expanded used these names
const LEGACY_APP_STATUS = { Pending: 'Submitted', Shortlisted: 'Under Review', 'Visit Scheduled': 'Meet & Greet', Rejected: 'Declined' };
const LEGACY_PET_STATUS = { 'Pending Adoption': 'On Hold' };

module.exports = { ROLES, ROLE_LABELS, PET_TYPES, DEFAULT_FEES, TYPE_GROUPS, PET_SIZES, PET_STATUSES, PUBLIC_PET_STATUSES, APP_FLOW, APP_STATUSES,
  APP_CLOSED, APP_NEEDS_DATE, APP_HOLDS_PET, APP_STATUS_INFO, LEGACY_APP_STATUS, LEGACY_PET_STATUS };
