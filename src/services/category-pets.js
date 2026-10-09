// Pets for the four adoption categories (Rescue & Rehabilitation, Domestic Pets, Exotic Pets, Rare & Special Breeds).
// Added by the seed for fresh installs and by the v5 migration for existing databases (matched by name + breed, so
// nothing is duplicated). All animals are fictional demo content; photos are PawPal's own illustrations until staff
// upload real ones from Edit pet. Care facts are general guidance — profiles tell adopters to confirm with the shelter.
const art = (file) => `images/pets/${file}.svg`;
const DOG_CAT_HEALTH = ['Vet health check on intake', 'Vaccinated, desexed and microchipped', 'Flea, tick and worm treatment up to date'];
const REHAB_HEALTH = ['Full vet assessment and treatment after rescue', 'Vaccinated, desexed and microchipped', 'Signed off as healthy by the shelter vet'];
const EXOTIC_HEALTH = ['Health check by an exotics vet', 'Eating and behaving normally in care', 'Setup advice included on adoption day'];

const MORE_CARE = {
  hens: {
    lifespan: 'Around 3–6 more years',
    home: 'A secure, fox-proof coop with a perch and nesting box, plus a run or yard with shade, dust-bathing spots and grass to scratch.',
    diet: 'Layer pellets as the main food, fresh water, shell grit, and greens or vegetable scraps as treats (never avocado or mouldy food).',
    routine: 'Let out in the morning and locked in at dusk, eggs collected daily, coop cleaned weekly and checked for mites.',
    note: 'Check your council\'s rules on keeping poultry. Hens are flock animals and must live with at least one other hen.',
  },
  guineapig: {
    lifespan: '5–7 years',
    home: 'A large indoor enclosure (at least 120 × 60 cm for a pair) with hides, deep bedding and daily floor time.',
    diet: 'Unlimited fresh hay, a cup of leafy greens each day, a little pellet food and a source of vitamin C.',
    routine: 'Fresh hay, greens and water daily, spot-clean daily and a full clean weekly, nails trimmed monthly.',
    note: 'Guinea pigs are very social and must live in pairs or groups.',
  },
  galah: {
    lifespan: '40–60 years — a lifelong commitment',
    home: 'A very large aviary or cage with natural branches to chew, plus several hours of supervised time out every day.',
    diet: 'Quality pellets, fresh vegetables, sprouted seed and a little fruit; seed-only diets cause serious health problems.',
    routine: 'Daily company and enrichment, new things to chew and forage, and a bath or misting a few times a week.',
    note: 'Galahs are native birds: check your state\'s licence rules. They are loud at dawn and dusk and need a lot of attention.',
  },
  turtle: {
    lifespan: '30–50 years',
    home: 'A large tank (at least 300 litres for an adult) with strong filtration, a heated water area, a dry basking platform and UVB lighting.',
    diet: 'Carnivorous: turtle pellets, small fish, insects, worms and yabbies.',
    routine: 'Feed every 1–2 days as an adult, partial water changes weekly, filter maintenance monthly.',
    note: 'Native turtles need a keeper licence in most states. Never release a pet turtle into waterways.',
  },
  axolotl: {
    lifespan: '10–15 years',
    home: 'A cool freshwater aquarium (at least 75 litres) kept around 14–20°C, gentle filtration, fine sand or a bare floor and hides.',
    diet: 'Earthworms, axolotl pellets and bloodworms, fed every 2–3 days.',
    routine: 'Weekly partial water changes, regular water testing, and keeping the tank cool in summer.',
    note: 'Axolotls are amphibians with delicate skin, so avoid handling and never house them with fish that nip.',
  },
  highland: {
    lifespan: '15–20 years',
    home: 'At least half a hectare of good pasture with shelter and shade, secure fencing and another cow for company.',
    diet: 'Pasture or quality hay, fresh water and a mineral lick; very little grain.',
    routine: 'Daily checks and water, regular hoof trimming, drenching and vaccinations as your large-animal vet advises.',
    note: 'You will need a Property Identification Code (PIC) and NLIS tag to keep cattle. Cattle are herd animals and need a companion.',
  },
};

const CATEGORY_PETS = [
  // ---------- Rescue & Rehabilitation ----------
  { category: 'rescue', name: 'Hope', type: 'Dog', breed: 'Staffordshire Bull Terrier Cross', age: 3, gender: 'Female', size: 'Medium', colour: 'Brindle', location: 'Footscray, VIC', adoptionFee: 250,
    traits: ['Affectionate', 'Resilient', 'Food Motivated'], energyLevel: 2, requiresYard: true, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: true, desexed: true, microchipped: true, healthChecks: REHAB_HEALTH,
    idealHome: 'A patient home with a secure yard and no other dogs, where she can be the centre of attention.',
    description: 'Hope was found tied up in a backyard, underweight and frightened. After four months of vet care and foster love she has transformed into a cheerful, cuddly girl who adores belly rubs and anyone holding a treat. She still startles at sudden noises, so a calm household and a few gentle routines will help her finish settling. Hope walks well on a lead, knows sit and drop, and is ready for a family to call her own.',
    photos: [art('dog-c')] },
  { category: 'rescue', name: 'Bramble', type: 'Dog', breed: 'Greyhound (retired racer)', age: 4, gender: 'Male', size: 'Large', colour: 'Black', location: 'Parramatta, NSW', adoptionFee: 200,
    traits: ['Gentle', 'Quiet', 'Couch Lover'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: true, desexed: true, microchipped: true, healthChecks: REHAB_HEALTH,
    idealHome: 'An apartment or house without cats or small pets, with a soft bed and a short walk twice a day.',
    description: 'Bramble raced for two years before he was retired and handed to our rehabilitation program. Like most greyhounds he is a gentle giant who would rather sleep 18 hours a day than run. He has learned to climb stairs, ride in a car and relax in a home, and now he is ready for a sofa of his own. Bramble is quiet, polite with children and happy in an apartment, but he has a strong chase instinct, so he must live without cats or small pets and wear a muzzle at off-lead parks.',
    photos: [art('dog-a')] },
  { category: 'rescue', name: 'Willow', type: 'Cat', breed: 'Domestic Shorthair', age: 6, gender: 'Female', size: 'Small', colour: 'Grey & white', location: 'Woolloongabba, QLD', adoptionFee: 100,
    traits: ['Shy', 'Sweet', 'Quiet'], energyLevel: 1, requiresYard: false, goodWithChildren: false, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, healthChecks: REHAB_HEALTH,
    idealHome: 'A calm, adults-only home where she can take her time and choose when to come for a cuddle.',
    description: 'Willow was one of more than forty cats rescued from a hoarding situation. She arrived matted and nervous, and our carers spent weeks earning her trust. Today she purrs the moment you sit down beside her, loves a warm windowsill and gets along with other calm cats. She still needs a few days to hide and explore when she moves, so she is best suited to a quiet home with patient adults.',
    photos: [art('cat-c')] },
  { category: 'rescue', name: 'Henny, Penny & Dot', type: 'Farm Animal', breed: 'Ex-battery hens (bonded trio)', age: 2, gender: 'Female', size: 'Small', colour: 'Brown', location: 'Osborne Park, WA', adoptionFee: 30,
    traits: ['Curious', 'Friendly', 'Bonded Trio'], energyLevel: 2, requiresYard: true, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: true, desexed: false, microchipped: false, healthChecks: ['Checked by a poultry vet', 'Feathers regrowing well', 'Treated for mites and worms'],
    idealHome: 'A backyard with a fox-proof coop, room to scratch and dust-bathe, and no dogs that chase birds.',
    description: 'Henny, Penny and Dot spent their first year in a commercial cage farm and had never felt grass until they were rescued. They arrived with patchy feathers and pale combs, and now they are bright, chatty and feathered again. They follow people around the yard hoping for treats, love dust baths, and still lay the odd egg. The three are bonded and will only be adopted together.',
    care: MORE_CARE.hens, photos: [art('bird-c')] },

  // ---------- Domestic Pets ----------
  { category: 'domestic', name: 'Pudding & Truffle', type: 'Guinea Pig', breed: 'American Guinea Pig (bonded pair)', age: 1, gender: 'Male', size: 'Small', colour: 'Ginger & tri-colour', location: 'Footscray, VIC', adoptionFee: 60,
    traits: ['Chatty', 'Gentle', 'Bonded Pair'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: false, desexed: true, microchipped: false, healthChecks: EXOTIC_HEALTH,
    idealHome: 'A family with a big indoor enclosure and kids who love sitting on the floor for gentle cuddles.',
    description: 'Pudding and Truffle are brothers who "wheek" loudly whenever they hear the fridge open. They are relaxed with handling, love floor time and tunnels, and are a great first pet for a family with school-aged children. They have always lived together and must be adopted as a pair.',
    care: MORE_CARE.guineapig, photos: [art('small-d')] },
  { category: 'domestic', name: 'Marshmallow', type: 'Rabbit', breed: 'Mini Lop', age: 2, gender: 'Female', size: 'Small', colour: 'White & fawn', location: 'Parramatta, NSW', adoptionFee: 120,
    traits: ['Playful', 'Litter Trained', 'Affectionate'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: true, desexed: true, microchipped: true, healthChecks: ['Vaccinated against calicivirus', 'Desexed and microchipped', 'Teeth and nails checked'],
    idealHome: 'An indoor home with a bunny-proofed room or pen and someone home to give her daily playtime.',
    description: 'Marshmallow is a floppy-eared Mini Lop who is fully litter trained and loves to "binky" across the room when she is happy. She enjoys gentle pats on the floor, cardboard castles and her daily bowl of herbs. She would suit an indoor family home, and she could be bonded with a desexed male rabbit later on.',
    photos: [art('rabbit-c')] },

  // ---------- Exotic Pets ----------
  { category: 'exotic', name: 'Rio', type: 'Bird', breed: 'Galah', age: 8, gender: 'Male', size: 'Medium', colour: 'Pink & grey', location: 'Woolloongabba, QLD', adoptionFee: 180,
    traits: ['Talkative', 'Clever', 'Cheeky'], energyLevel: 3, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: [...EXOTIC_HEALTH, 'Tested clear of psittacine beak and feather disease'],
    idealHome: 'An experienced bird keeper who is home most of the day and can offer a large aviary and lots of company.',
    description: 'Rio is a cheeky eight-year-old galah who says "hello darling" and laughs at his own jokes. He was surrendered when his owner moved into aged care, and he misses having a person to follow around. Rio needs several hours of company every day, plenty of things to chew, and a keeper ready for a bird who could live another forty years.',
    care: MORE_CARE.galah, photos: [art('bird-d')] },
  { category: 'exotic', name: 'Shelly', type: 'Reptile', breed: 'Eastern Long-necked Turtle', age: 12, gender: 'Female', size: 'Small', colour: 'Dark brown', location: 'Parramatta, NSW', adoptionFee: 90,
    traits: ['Calm', 'Curious', 'Low Maintenance'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: EXOTIC_HEALTH,
    idealHome: 'A licensed keeper with space for a large tank and the long-term commitment a turtle needs.',
    description: 'Shelly is a gentle long-necked turtle who stretches her neck out to see who is visiting her tank. She eats well, basks every afternoon and is easy to care for once her setup is right. Her previous family could no longer keep her, and she is looking for a keeper who knows that turtles can live for decades.',
    care: MORE_CARE.turtle, photos: [art('reptile-c')] },
  { category: 'exotic', name: 'Axel', type: 'Other', breed: 'Axolotl', age: 2, gender: 'Male', size: 'Small', colour: 'Leucistic pink', location: 'Osborne Park, WA', adoptionFee: 40,
    traits: ['Calm', 'Unusual', 'Easy Going'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: EXOTIC_HEALTH,
    idealHome: 'A home with a cool, quiet spot for an aquarium and someone happy to keep up with water care.',
    description: 'Axel is a pink axolotl with feathery gills and a permanent smile. Axolotls are amphibians that stay in the water their whole lives, and Axel spends his days wandering the bottom of his tank and waiting for dinner. He is a fascinating, low-noise companion, but he needs cool water, so a calm room away from windows is ideal.',
    care: MORE_CARE.axolotl, photos: [art('fish-d')] },

  // ---------- Rare & Special Breeds ----------
  { category: 'rare', name: 'Saffron', type: 'Cat', breed: 'Sphynx', age: 3, gender: 'Female', size: 'Small', colour: 'Peach (hairless)', location: 'Footscray, VIC', adoptionFee: 350,
    traits: ['Social', 'Warm Seeker', 'Playful'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, healthChecks: [...DOG_CAT_HEALTH, 'Heart screening completed'],
    idealHome: 'An indoor home with someone around most of the day, warm blankets and a weekly bath routine.',
    description: 'Saffron is a Sphynx, one of the few hairless cat breeds. She feels like warm suede, follows people from room to room and loves to burrow under the covers. Without fur she needs to stay indoors, wear a jumper in winter and have a gentle bath each week to remove skin oils. She is outgoing and affectionate and gets along with other friendly cats.',
    photos: [art('cat-d')] },
  { category: 'rare', name: 'Kona', type: 'Dog', breed: 'Lagotto Romagnolo', age: 2, gender: 'Male', size: 'Medium', colour: 'Brown roan, curly', location: 'Woolloongabba, QLD', adoptionFee: 600,
    traits: ['Smart', 'Low Shedding', 'Loves to Sniff'], energyLevel: 3, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: true, healthChecks: [...DOG_CAT_HEALTH, 'Hips scored by the breeder before surrender'],
    idealHome: 'An active family who enjoys training games, sniffing walks and a yard to explore.',
    description: 'Kona is a Lagotto Romagnolo, an old Italian breed traditionally used to sniff out truffles. His curly, low-shedding coat makes him popular with families who have allergies, and his clever nose means he loves scent games and puzzle feeders. Kona was surrendered by a family whose work hours changed. He is friendly with children and other dogs, and needs daily exercise and regular grooming.',
    photos: [art('dog-d')] },
  { category: 'rare', name: 'Pippin', type: 'Farm Animal', breed: 'Miniature Highland Cow', age: 3, gender: 'Male', size: 'Large', colour: 'Red, shaggy', location: 'Osborne Park, WA', adoptionFee: 900,
    traits: ['Gentle', 'Fluffy', 'Easy Going'], energyLevel: 1, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: false, healthChecks: ['Checked by a large-animal vet', 'Vaccinated and drenched', 'NLIS tagged'],
    idealHome: 'A small acreage with good pasture, shelter and another cow or a goat for company.',
    description: 'Pippin is a miniature Highland steer with a shaggy red fringe that covers his eyes. Highlands are a hardy Scottish breed known for their calm, friendly nature. Pippin is halter trained, loves a brush and stands patiently for the farrier. He came to us when his farm was sold, and he is looking for a small acreage where he can graze with a companion.',
    care: MORE_CARE.highland, photos: [art('cow-a')] },
];

// Starting categories for the original demo pets (by name + breed); everything else uses defaultCategory()
const DEMO_CATEGORY = {
  'archie|mixed breed': 'rescue', 'ruby|mixed breed': 'rescue', 'juno|mixed breed': 'rescue', 'pepper|kelpie cross': 'rescue', 'tilly|domestic shorthair': 'rescue',
  'leo|maine coon': 'rare', 'charlie|pembroke welsh corgi': 'rare',
};
const demoCategory = (p) => DEMO_CATEGORY[`${p.name}|${p.breed}`.toLowerCase()] || null;

module.exports = { CATEGORY_PETS, MORE_CARE, demoCategory };
