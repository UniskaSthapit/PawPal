// PawPal's own knowledge: adoption FAQ and application question explanations.
// Used by the FAQ section, the chatbot and the application assistant so answers stay consistent.

const FAQ = [
  { id: 'process', q: 'How does adopting through PawPal work?', keywords: ['how does', 'how do i adopt', 'process', 'steps', 'how to adopt', 'start'],
    a: 'Tell PawPal about your lifestyle to see compatible pets, explore their profiles, then apply for the one you love. The shelter team reviews your application, may arrange a short interview and a meet & greet, and once approved you book your go-home day. You can follow every step on your adoption timeline.' },
  { id: 'after-apply', q: 'What happens after I apply?', keywords: ['after i apply', 'after applying', 'what happens next', 'next step', 'once i apply', 'submitted'],
    a: 'Your application goes straight to the shelter caring for the pet. It moves through Submitted → Under Review → Interview → Meet & Greet → Approved → Adoption Scheduled → Adopted. The team may also ask for more information. You get an email and a notification at every change, and you can reply to the shelter from your dashboard.' },
  { id: 'how-long', q: 'How long does the adoption process take?', keywords: ['how long', 'take', 'timeframe', 'wait', 'quick', 'days'],
    a: 'Most applications are first reviewed within 2–3 business days. From there, a typical adoption takes one to two weeks depending on interview and meet & greet availability.' },
  { id: 'fees', q: 'How much does it cost to adopt?', keywords: ['cost', 'fee', 'fees', 'price', 'how much', 'pay', 'expensive'],
    a: 'Each pet\'s adoption fee is shown on their profile. Fees help cover desexing, vaccinations, microchipping and health checks that have already been done — usually far less than paying for those separately.' },
  { id: 'included', q: 'What is included when I adopt?', keywords: ['included', 'vaccinat', 'desex', 'microchip', 'vet check', 'health'],
    a: 'Every pet\'s profile lists whether they are vaccinated, desexed and microchipped. Shelter-provided health information is shown as provided by the shelter; ask the team if you would like more detail.' },
  { id: 'renting', q: 'Can I adopt if I rent?', keywords: ['rent', 'renting', 'landlord', 'lease', 'tenant', 'rental'],
    a: 'Yes. Many adopters rent. The shelter may ask for your landlord\'s written permission for a pet, so it helps to have that ready before your meet & greet.' },
  { id: 'requirements', q: 'Who can adopt?', keywords: ['who can', 'requirements', 'eligible', 'age', '18', 'id', 'identification'],
    a: 'Adopters need to be 18 or older with photo ID, and able to show the pet will be welcome in their home (for renters, landlord approval). Every application is considered on how well the pet and home suit each other.' },
  { id: 'meet', q: 'What is a meet & greet?', keywords: ['meet and greet', 'meet & greet', 'visit', 'meet the pet', 'see the pet', 'in person'],
    a: 'A meet & greet is a relaxed visit at the shelter so you and the pet can spend time together. If you have a dog at home, the team may suggest bringing them along to check the two get on.' },
  { id: 'multiple', q: 'Can I apply for more than one pet?', keywords: ['more than one', 'multiple', 'two pets', 'another application'],
    a: 'Yes — you can have open applications for different pets, but only one open application per pet at a time.' },
  { id: 'ai', q: 'How does PawPal\'s matching work?', keywords: ['ai', 'matching', 'match', 'percentage', 'score', 'algorithm', 'recommend'],
    a: 'PawPal compares what you tell it about your home, schedule, experience and household with the facts the shelter has recorded about each pet (energy, size, whether they need a yard, how they are with children and other animals). The match percentage is guidance to help you explore — it can\'t guarantee how any animal will behave, and the shelter team always has the final say.' },
  { id: 'return', q: 'What if it doesn\'t work out?', keywords: ['return', 'doesnt work', 'does not work', 'give back', 'surrender', 'problem'],
    a: 'Contact the shelter as soon as possible. They would always rather help you work through settling-in issues, and if needed they will take the pet back so they can find them the right home.' },
  { id: 'status', q: 'How do I check my application status?', keywords: ['status', 'my application', 'track', 'progress', 'where is my'],
    a: 'Log in and open My Applications. Each application shows a timeline with the current stage, dates, any appointment and messages from the shelter.' },
];

// Explanations for adoption application questions. The assistant explains the question;
// it never suggests or fills in the adopter's answer.
const APPLICATION_QUESTIONS = {
  livingType: { label: 'What type of home do you live in?', help: 'This helps the shelter understand how much space and outdoor access the pet will have. Some pets, especially active dogs, need a secure yard, while many cats and calmer dogs are happy in apartments.' },
  ownership: { label: 'Do you own or rent your home?', help: 'Renters can absolutely adopt. The shelter asks so they know whether landlord permission will be needed for the pet.' },
  landlordPermission: { label: 'Do you have your landlord\'s permission?', help: 'If you rent, the shelter may need to see written permission from your landlord or agent that a pet is allowed. If you do not have it yet, you can answer honestly and arrange it before the meet & greet.' },
  activityLevel: { label: 'How active is your household?', help: 'Pets have very different exercise needs. Answering honestly helps the shelter make sure the pet\'s energy suits your routine.' },
  hoursAlone: { label: 'How many hours a day would the pet be alone?', help: 'Think about a typical weekday, including your commute. Many dogs struggle when alone for long periods, while cats and some calmer pets cope better. There is no "wrong" answer — the shelter uses it to plan support such as a dog walker.' },
  hasChildren: { label: 'Are there children in the home?', help: 'Some pets are wonderful with children; others are nervous or need a quieter home. Include children who visit regularly, like grandchildren.' },
  hasOtherPets: { label: 'Do you have other pets?', help: 'The shelter checks whether the pet is known to get on with other animals and may suggest an introduction at the meet & greet.' },
  experience: { label: 'What is your experience with pets?', help: 'First-time owners are very welcome. This simply helps the shelter recommend pets that match your confidence and offer the right support.' },
  experienceDetails: { label: 'Tell us about your pet experience', help: 'Share pets you have cared for — as a child, as an adult, fostering or pet sitting. A few sentences is plenty.' },
  motivation: { label: 'Why would you like to adopt this pet?', help: 'Tell the shelter what drew you to this pet and how they would fit into your life. There is no right answer; it helps the team get to know you.' },
  workSchedule: { label: 'What does a typical week look like?', help: 'A short description of your work or study pattern (for example "office Mon–Wed, home Thu–Fri") helps the shelter picture the pet\'s routine.' },
  householdAdults: { label: 'How many adults live in the home?', help: 'Count everyone 18 or over who lives with you. The shelter may want everyone to meet the pet before adoption.' },
};

function findFaq(text) {
  const t = ` ${String(text || '').toLowerCase().replace(/[’']/g, '')} `;
  let best = null; let bestScore = 0;
  for (const f of FAQ) {
    const score = f.keywords.reduce((s, k) => s + (t.includes(k) ? k.length : 0), 0);
    if (score > bestScore) { best = f; bestScore = score; }
  }
  return bestScore >= 3 ? best : null;
}

module.exports = { FAQ, APPLICATION_QUESTIONS, findFaq };
