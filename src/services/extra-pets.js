// More kinds of animals for the demo catalogue: reptiles (snakes and lizards), birds, fish, hamsters and farm
// animals (goats and cows). Used by the seed for fresh installs and by the v3 migration for existing databases,
// so a live site gets them too. Every pet carries a written profile and a species care guide (`care`) shown on its
// profile page. All animals are fictional demo content; photos are PawPal's own illustrations until staff upload real ones.

const art = (file) => `images/pets/${file}.svg`;

// Care guides shared by animals of the same kind. Facts are general guidance — profiles tell adopters to confirm with the shelter.
const CARE = {
  python: {
    lifespan: '20+ years with good care',
    home: 'A secure, lockable enclosure with a warm end (around 30–32°C basking) and a cooler end, plus a hide at each end and a water bowl big enough to soak in.',
    diet: 'Frozen-thawed rodents sized to the snake, every 1–3 weeks depending on age.',
    routine: 'Spot-clean daily, fresh water every day, a full enclosure clean monthly. Handle calmly a few times a week.',
    note: 'Pythons are Australian natives, so most states require a reptile keeper licence from the state wildlife authority before you can adopt.',
  },
  dragon: {
    lifespan: '10–15 years',
    home: 'A large enclosure (at least 120 cm long) with a hot basking spot of about 38–42°C and a UVB tube running 12 hours a day.',
    diet: 'Live insects plus leafy greens and vegetables daily; adults eat mostly greens.',
    routine: 'Daily feeding and spot-cleaning, UVB tube replaced every 6–12 months, a warm bath now and then helps with shedding.',
    note: 'Bearded dragons are native reptiles — check your state\'s keeper licence rules before applying.',
  },
  bluetongue: {
    lifespan: '15–20 years or more',
    home: 'A spacious enclosure with a basking spot of around 35°C, UVB lighting, deep substrate to burrow in and several hides.',
    diet: 'An omnivore: a mix of greens, vegetables, a little fruit, snails and insects, plus occasional lean protein.',
    routine: 'Feed every 2–3 days as an adult, fresh water daily, spot-clean as needed.',
    note: 'Blue-tongue lizards are native and need a keeper licence in most states. Never release a pet lizard into the wild.',
  },
  cockatiel: {
    lifespan: '15–20 years',
    home: 'The biggest cage you can fit (wider than it is tall), with perches of different thicknesses, toys and daily time out of the cage.',
    diet: 'Quality pellets with fresh vegetables and a little seed — seed alone isn\'t a complete diet.',
    routine: 'Fresh food and water daily, a few hours of company and out-of-cage time every day, regular toy rotation.',
    note: 'Cockatiels are social and get lonely — someone home for part of the day, or a second bird, makes a big difference.',
  },
  budgie: {
    lifespan: 'Around 7–10 years',
    home: 'A roomy flight cage with horizontal bars for climbing, natural perches and swings, placed away from draughts and kitchens.',
    diet: 'Pellets or a quality seed mix plus fresh greens, sprouted seeds and a cuttlebone.',
    routine: 'Daily fresh food and water, weekly cage clean, daily chatter and supervised time out of the cage.',
    note: 'Budgies are flock birds and are happiest with a budgie friend.',
  },
  goldfish: {
    lifespan: '10–15 years with good care',
    home: 'A filtered aquarium, not a bowl — fancy goldfish need at least 75 litres for the first fish, with room to grow.',
    diet: 'Sinking goldfish pellets plus blanched peas and greens a few times a week. Feed only what they eat in a couple of minutes.',
    routine: 'Test the water weekly and change 20–30% of it with dechlorinated water. Rinse the filter sponge in old tank water, never under the tap.',
    note: 'Goldfish are cold-water fish and don\'t need a heater, but they produce a lot of waste, so a good filter is essential.',
  },
  betta: {
    lifespan: '3–5 years',
    home: 'A heated (around 26°C), gently filtered tank of at least 20 litres with plants and a lid — bettas can jump.',
    diet: 'Betta pellets plus frozen bloodworm or brine shrimp as treats; small portions once or twice a day.',
    routine: 'Weekly partial water change, check the heater daily, keep the lid on.',
    note: 'Male bettas must live without other bettas. Some peaceful tank mates are fine — ask the shelter first.',
  },
  hamster: {
    lifespan: '2–3 years',
    home: 'A large cage or tank (at least 80 × 50 cm floor) with deep bedding to burrow in, a solid wheel of 26 cm or more, hides and chew toys.',
    diet: 'A quality hamster mix or pellets with small amounts of fresh vegetables. Fresh water daily.',
    routine: 'Spot-clean every few days, a deeper clean every couple of weeks. Hamsters are nocturnal, so plan play time for the evening.',
    note: 'Syrian hamsters must live alone. Hamsters suit older children who can handle them gently, with an adult in charge of care.',
  },
  goat: {
    lifespan: '12–15 years',
    home: 'Secure fencing (goats are escape artists), a dry, draught-free shelter and enough pasture or browse to roam. Never keep a goat alone.',
    diet: 'Mostly good-quality hay and browse, fresh water at all times and a mineral lick. Avoid feeding grain or garden scraps.',
    routine: 'Daily checks and feeding, hoof trims every 6–8 weeks, regular worming and vaccinations with a farm vet.',
    note: 'In Australia you need a Property Identification Code (PIC) from your state agriculture department, and goats must carry an NLIS ear tag.',
  },
  cow: {
    lifespan: 'Around 15–20 years',
    home: 'Several acres of good pasture per animal, a shelter or tree cover, secure fencing and at least one bovine companion — cattle are herd animals.',
    diet: 'Pasture plus hay through winter, a mineral lick and a large supply of clean water every day.',
    routine: 'Daily checks, regular vet care, hoof checks and drenching. A crush or yard makes vet visits much easier.',
    note: 'You\'ll need a Property Identification Code (PIC), and cattle must have an NLIS tag — the shelter helps with the transfer.',
  },
};

// Health notes that make sense for animals that aren't vaccinated, desexed or microchipped like a dog or cat
const EXOTIC_HEALTH = ['Health check by an exotics vet', 'Eating and behaving normally in care', 'Setup advice included on adoption day'];

const EXTRA_PETS = [
  // ---------- Reptiles: snakes ----------
  { name: 'Sable', type: 'Reptile', breed: 'Coastal Carpet Python', age: 4, gender: 'Female', size: 'Medium', colour: 'Olive & cream bands', location: 'Footscray, VIC', adoptionFee: 150,
    traits: ['Calm', 'Curious', 'Easy to Handle'], energyLevel: 1, requiresYard: false, goodWithChildren: false, goodWithOtherPets: false,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: [...EXOTIC_HEALTH, 'Sheds in one piece — a good sign of health'],
    idealHome: 'A licensed keeper or confident beginner with room for a 1.5 m enclosure and an adults-only household.',
    description: 'Sable is a gentle four-year-old carpet python who was surrendered when her owner moved interstate. She is about 1.6 metres long and still growing slowly, and she is one of the calmest snakes our reptile carers have met — she loops loosely around an arm and simply watches the room. She eats reliably every fortnight and has a clean bill of health. Sable needs a secure, heated enclosure and a keeper who is happy to commit for many years.',
    care: CARE.python, photos: [art('snake-a')] },
  { name: 'Noodle', type: 'Reptile', breed: "Children's Python", age: 2, gender: 'Male', size: 'Small', colour: 'Reddish brown, blotched', location: 'Parramatta, NSW', adoptionFee: 120,
    traits: ['Gentle', 'Small', 'First Reptile'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: EXOTIC_HEALTH,
    idealHome: 'A first-time reptile keeper with a licence and a quiet room for a modest enclosure.',
    description: 'Noodle is a two-year-old Children\'s python — a small Australian species named after the naturalist John George Children, not because he is a toy. He will only reach about a metre long, which makes him one of the easiest snakes to house. Noodle is relaxed with handling, rarely defensive and a great introduction to reptile keeping for a careful family with older kids, as long as an adult holds the licence and does the feeding.',
    care: CARE.python, photos: [art('snake-a')] },

  // ---------- Reptiles: lizards ----------
  { name: 'Ziggy', type: 'Reptile', breed: 'Central Bearded Dragon', age: 3, gender: 'Male', size: 'Medium', colour: 'Sandy orange', location: 'Woolloongabba, QLD', adoptionFee: 140,
    traits: ['Friendly', 'Sun Lover', 'Easy to Handle'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: EXOTIC_HEALTH,
    idealHome: 'A family ready to set up proper heat and UVB lighting, with someone who enjoys a daily chat with a lizard.',
    description: 'Ziggy is a three-year-old bearded dragon with a big personality. He waves at his carers, sits happily on a shoulder and loves a warm bath. He came to us when his family could no longer care for him and arrived a little underweight, but he is now eating well and basking like a champion. Ziggy is a wonderful first reptile for a family who will give him a large, well-lit enclosure.',
    care: CARE.dragon, photos: [art('lizard-a')] },
  { name: 'Bluey', type: 'Reptile', breed: 'Eastern Blue-tongue Lizard', age: 6, gender: 'Female', size: 'Medium', colour: 'Silver with dark bands', location: 'Osborne Park, WA', adoptionFee: 110,
    traits: ['Placid', 'Hardy', 'Quiet'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: EXOTIC_HEALTH,
    idealHome: 'A calm household with a licence to keep native reptiles and space for a long, low enclosure.',
    description: 'Bluey is a six-year-old eastern blue-tongue, captive-bred and surrendered by an owner who had kept her since she was a hatchling. She is placid, slow-moving and very tolerant of gentle handling, and she will happily show off her famous blue tongue when she wants some space. Bluey enjoys snails, greens and the odd piece of banana, and she spends her afternoons burrowed under her basking log.',
    care: CARE.bluetongue, photos: [art('lizard-a')] },

  // ---------- Birds ----------
  { name: 'Sunny', type: 'Bird', breed: 'Cockatiel', age: 4, gender: 'Male', size: 'Small', colour: 'Lutino (yellow & white)', location: 'Footscray, VIC', adoptionFee: 80,
    traits: ['Whistler', 'Affectionate', 'Social'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: ['Avian vet health check', 'Wings unclipped and flying well', 'Cage and starter food can be included'],
    idealHome: 'A home where someone is around for part of the day — Sunny wants to be part of the family.',
    description: 'Sunny is a four-year-old cockatiel who can whistle the first bars of three different songs and will gladly teach you a fourth. He is hand-tame, steps up onto a finger and loves having his head scratched. Sunny was surrendered when his elderly owner moved into care, and he is looking for a home where he will get daily company and time out of his cage.',
    care: CARE.cockatiel, photos: [art('bird-c')] },
  { name: 'Peaches & Pip', type: 'Bird', breed: 'Budgerigar (bonded pair)', age: 1, gender: 'Unknown', size: 'Small', colour: 'Green and sky blue', location: 'Parramatta, NSW', adoptionFee: 60,
    traits: ['Chatty', 'Bonded Pair', 'Apartment Friendly'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: ['Avian vet health check', 'Both birds eating well', 'Adopted together as a pair'],
    idealHome: 'An apartment or house with a bright, draught-free spot for a roomy flight cage.',
    description: 'Peaches and Pip are a bonded pair of young budgies who must be adopted together. They chatter all morning, preen each other in the afternoon and are slowly learning to step onto a finger. They are an ideal first bird experience: cheerful, low-cost and happy in an apartment, as long as they get a big cage and a bit of attention each day.',
    care: CARE.budgie, photos: [art('bird-b')] },

  // ---------- Fish ----------
  { name: 'Bubbles', type: 'Fish', breed: 'Oranda Goldfish', age: 2, gender: 'Unknown', size: 'Small', colour: 'Red & white', location: 'Parramatta, NSW', adoptionFee: 20,
    traits: ['Peaceful', 'Low Maintenance', 'Apartment Friendly'], energyLevel: 1, requiresYard: false, goodWithChildren: true, goodWithOtherPets: true, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: ['Healthy fins and colour', 'Eating well', 'Comes with water-care tips'],
    idealHome: 'Anyone with space for a properly filtered tank — great for apartments and quiet homes.',
    description: 'Bubbles is a two-year-old oranda goldfish with a fluffy red "hood" who greets anyone who walks past the tank. She was rescued from a small bowl and has transformed in a proper filtered aquarium. Fish are calming to watch and easy to care for once the tank is set up well, which makes Bubbles a lovely companion for an apartment, a home office or a classroom.',
    care: CARE.goldfish, photos: [art('fish-a')] },
  { name: 'Neptune', type: 'Fish', breed: 'Siamese Fighting Fish (Betta)', age: 1, gender: 'Male', size: 'Small', colour: 'Royal blue', location: 'Woolloongabba, QLD', adoptionFee: 15,
    traits: ['Colourful', 'Curious', 'Apartment Friendly'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: ['Fins intact and healthy', 'Active and eating well'],
    idealHome: 'A heated, planted tank all of his own on a sturdy shelf.',
    description: 'Neptune is a young betta with flowing royal-blue fins and a surprising amount of personality. He builds bubble nests, follows fingers along the glass and flares proudly at his own reflection. Bettas need warm water and a tank to themselves, but they are small, quiet and ideal for anyone who would love a pet that fits on a desk.',
    care: CARE.betta, photos: [art('fish-d')] },

  // ---------- Hamsters ----------
  { name: 'Hazel', type: 'Hamster', breed: 'Syrian Hamster (long-haired)', age: 1, gender: 'Female', size: 'Small', colour: 'Cream & fawn', location: 'Footscray, VIC', adoptionFee: 25,
    traits: ['Gentle', 'Fluffy', 'Night Owl'], energyLevel: 2, requiresYard: false, goodWithChildren: true, goodWithOtherPets: false, firstTimeFriendly: true,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: ['Vet health check', 'Teeth and coat in good condition'],
    idealHome: 'A quiet bedroom or living area and an owner who enjoys evening playtime.',
    description: 'Hazel is a fluffy long-haired Syrian hamster who loves burrowing, stuffing her cheeks and running on her wheel after dark. She was handled from a young age and is very calm in cupped hands. Like all Syrian hamsters she must live on her own, and she needs a big cage with deep bedding to be truly happy.',
    care: CARE.hamster, photos: [art('small-c')] },
  { name: 'Biscotti', type: 'Hamster', breed: 'Roborovski Hamster', age: 0, gender: 'Male', size: 'Small', colour: 'Sandy with white eyebrows', location: 'Osborne Park, WA', adoptionFee: 20,
    traits: ['Speedy', 'Entertaining', 'Tiny'], energyLevel: 3, requiresYard: false, goodWithChildren: false, goodWithOtherPets: false,
    vaccinated: false, desexed: false, microchipped: false, healthChecks: ['Vet health check', 'Bright, alert and eating well'],
    idealHome: 'An adult or teen who would enjoy watching a busy little hamster more than handling one.',
    description: 'Biscotti is a tiny, lightning-fast Roborovski hamster — the smallest and quickest of the hamster family. He is more of a "watch me" pet than a cuddler and puts on a show every evening, zooming through tunnels and digging elaborate burrows. He would suit an adult or teenager who loves a well-designed enclosure.',
    care: CARE.hamster, photos: [art('small-a')] },

  // ---------- Farm animals: goats ----------
  { name: 'Clover', type: 'Farm Animal', breed: 'Pygmy Goat', age: 3, gender: 'Female', size: 'Medium', colour: 'Caramel & black', location: 'Footscray, VIC', adoptionFee: 180,
    traits: ['Friendly', 'Playful', 'Needs a Goat Friend'], energyLevel: 2, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: false, microchipped: false, healthChecks: ['Farm vet check', 'Vaccinated (5-in-1)', 'Hooves trimmed', 'NLIS ear tag fitted'],
    idealHome: 'A small acreage or large, securely fenced yard where she can live with at least one other goat.',
    description: 'Clover is a three-year-old pygmy goat who climbs anything, eats everything she is allowed to and follows her carers around like a dog. She is friendly with children and gets on well with dogs that are calm around livestock. Goats are herd animals, so Clover will only be rehomed to a property that already has a goat — or with her best friend from the shelter paddock.',
    care: CARE.goat, photos: [art('goat-a')] },
  { name: 'Pickles', type: 'Farm Animal', breed: 'Saanen Goat (wether)', age: 5, gender: 'Male', size: 'Large', colour: 'White', location: 'Parramatta, NSW', adoptionFee: 150,
    traits: ['Gentle Giant', 'Calm', 'Loves Scratches'], energyLevel: 1, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: true, microchipped: false, healthChecks: ['Farm vet check', 'Vaccinated (5-in-1)', 'Desexed (wether)', 'NLIS ear tag fitted'],
    idealHome: 'A hobby farm or rural block with good fencing, a shelter and goat company.',
    description: 'Pickles is a big, gentle Saanen wether who came to us from a petting farm that closed down. He is calm, loves a scratch behind the ears and is wonderful with visiting school groups. Pickles would make a perfect companion goat for a hobby farm, and he is happy to share a paddock with sheep or an older goat who needs a friend.',
    care: CARE.goat, photos: [art('goat-a')] },

  // ---------- Farm animals: cows ----------
  { name: 'Buttercup', type: 'Farm Animal', breed: 'Miniature Jersey Cow', age: 4, gender: 'Female', size: 'Large', colour: 'Fawn', location: 'Woolloongabba, QLD', adoptionFee: 650,
    traits: ['Gentle', 'Halter Trained', 'Affectionate'], energyLevel: 1, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: false, microchipped: false, healthChecks: ['Farm vet check', 'Vaccinated', 'Halter trained', 'NLIS ear tag fitted'],
    idealHome: 'A rural property with good pasture and another cow or calm companion animal for company.',
    description: 'Buttercup is a four-year-old miniature Jersey with enormous eyelashes and a very sweet nature. She is halter trained, stands quietly for the vet and will follow a bucket anywhere. Buttercup came to us when her family sold their farm. She needs acreage, good pasture and a herd companion, and in return she will be the calmest, friendliest member of your property.',
    care: CARE.cow, photos: [art('cow-a')] },
  { name: 'Marigold', type: 'Farm Animal', breed: 'Dexter Cow', age: 7, gender: 'Female', size: 'Large', colour: 'Black', location: 'Osborne Park, WA', adoptionFee: 550,
    traits: ['Easy-going', 'Hardy', 'Retired'], energyLevel: 1, requiresYard: true, goodWithChildren: true, goodWithOtherPets: true,
    vaccinated: true, desexed: false, microchipped: false, healthChecks: ['Farm vet check', 'Vaccinated', 'Hooves checked', 'NLIS ear tag fitted'],
    idealHome: 'A lifestyle block or small farm looking for a gentle, retired cow to keep a herd company.',
    description: 'Marigold is a seven-year-old Dexter — a small, hardy heritage breed — who has retired from a family dairy. She is placid, easy to handle and particularly good at keeping younger cattle calm. Marigold is looking for a forever paddock where she can graze, doze under a tree and enjoy plenty of chin scratches.',
    care: CARE.cow, photos: [art('cow-a')] },
];

module.exports = { EXTRA_PETS, CARE };
