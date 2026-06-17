// Build the EN kid-fact pack from the 10 Curiosaurs PNG templates in temp/timur.
// Run a small visual pass:
//   node --import tsx --experimental-sqlite src/scripts/build-curiosaurs-english.ts --count=60
// Build and seed the full live pack:
//   node --import tsx --experimental-sqlite src/scripts/build-curiosaurs-english.ts --count=800 --seed
import puppeteer from "puppeteer-core";
import { DatabaseSync } from "node:sqlite";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromePath } from "../render.ts";
import { createPack, addCards, listPacks, type PackTemplate } from "../packs/store.ts";
import { renderTemplateCard, type TemplateDoc, type TemplateElement } from "../template/render.ts";

const PACK_NAME = "Curiosaurs English Facts";
const HOOK = "Did you know? 🦕";
const CTA = "Follow for more!";
const COUNT = Number(process.argv.find((a) => a.startsWith("--count="))?.split("=")[1] ?? 800);
const SEED = process.argv.includes("--seed");

const SOURCE_DIR = resolve("temp/timur");
const PACK_DIR = resolve("assets/template-packs/curiosaurs-english");
const BG_DIR = resolve(PACK_DIR, "backgrounds");
const TEMPLATE_DIR = resolve(PACK_DIR, "templates");
const OUT_DIR = resolve("data/output/curiosaurs-english");
const QA_DIR = resolve(OUT_DIR, "qa");

const THEMES = ["animals", "space", "dinosaurs", "human_body", "ocean", "nature"] as const;
type Theme = (typeof THEMES)[number];
type PackCard = { id: number; theme: Theme; template: string; hook: string; fact: string; cta: string };

const TEMPLATE_SPECS = [
  { key: "01_sunny_day", file: "curiosaurs_01_sunny_day.png", cardY: 548, accent: "#2f7ccf" },
  { key: "02_bedtime_stars", file: "curiosaurs_02_bedtime_stars.png", cardY: 548, accent: "#f4ca35" },
  { key: "03_rainbow_pop", file: "curiosaurs_03_rainbow_pop.png", cardY: 548, accent: "#ef5e67" },
  { key: "04_jungle", file: "curiosaurs_04_jungle.png", cardY: 548, accent: "#218c53" },
  { key: "05_outer_space", file: "curiosaurs_05_outer_space.png", cardY: 548, accent: "#ff7a3c" },
  { key: "06_under_the_sea", file: "curiosaurs_06_under_the_sea.png", cardY: 548, accent: "#16866f" },
  { key: "07_confetti_party", file: "curiosaurs_07_confetti_party.png", cardY: 548, accent: "#ef6680" },
  { key: "08_brainy_school", file: "curiosaurs_08_brainy_school.png", cardY: 548, accent: "#ff8a1c" },
  { key: "09_flower_meadow", file: "curiosaurs_09_flower_meadow.png", cardY: 548, accent: "#ee5f8c" },
  { key: "10_crayon_doodle", file: "curiosaurs_10_crayon_doodle.png", cardY: 548, accent: "#8d73ea" },
] as const;

function killbox(
  id: string,
  role: string,
  x: number,
  y: number,
  w: number,
  h: number,
  size: number,
  color: string,
  weight: number,
  lineHeight: number,
  maxChars: number,
  extra: Record<string, unknown> = {},
): TemplateElement {
  return {
    id,
    type: "killbox",
    x,
    y,
    w,
    h,
    rot: 0,
    role,
    padX: 4,
    padY: 0,
    align: "center",
    valign: "center",
    font: { family: "Inter", size, weight, color, lineHeight },
    fitMin: Math.max(28, Math.floor(size * 0.72)),
    fitMax: size,
    maxChars,
    placeholder: role,
    ...extra,
  };
}

function makeTemplate(spec: (typeof TEMPLATE_SPECS)[number]): PackTemplate {
  const cardX = 168;
  const cardW = 744;
  const textX = cardX + 56;
  const textW = cardW - 112;
  const y = spec.cardY;
  const template: TemplateDoc = {
    version: 1,
    name: `curiosaurs-en-${spec.key}`,
    canvas: { w: 1080, h: 1920, bg: "#ffffff" },
    elements: [
      {
        id: "background",
        type: "image",
        x: 0,
        y: 0,
        w: 1080,
        h: 1920,
        rot: 0,
        src: `assets/template-packs/curiosaurs-english/backgrounds/${spec.file}`,
        fit: "cover",
      },
      killbox("hook", "hook", textX, y + 84, textW, 92, 70, "#111827", 800, 1.05, 24),
      killbox("fact", "fact", textX, y + 206, textW, 318, 58, "#162033", 700, 1.14, 128, {
        fitMin: 40,
      }),
      killbox("cta", "cta", textX, y + 558, textW, 78, 44, spec.accent, 800, 1.05, 20),
    ],
  };
  return template as PackTemplate;
}

function uniq(items: string[]): string[] {
  return [...new Set(items.map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean))];
}

function animalFacts(): string[] {
  const facts = [
    "Elephants use their trunks to smell, drink, and pick up food.",
    "A giraffe's long neck helps it reach leaves high in trees.",
    "Penguins are birds, but they swim instead of fly.",
    "Dolphins breathe air through a blowhole on top of the head.",
    "Butterflies taste with their feet.",
    "Honeybees tell other bees about flowers by dancing.",
    "Cats use their whiskers to sense narrow spaces.",
    "Dogs have a strong sense of smell.",
    "Camels store fat in their humps for energy.",
    "Kangaroos carry babies in a pouch.",
    "Hummingbirds can hover in one place while they drink nectar.",
    "Owls have soft feathers that help them fly quietly.",
    "Turtles have shells that are part of their skeleton.",
    "Snails move on one wide foot.",
    "Ants leave scent trails for other ants to follow.",
    "Beavers build dams with sticks and mud.",
    "Zebras have stripe patterns that are unique to each animal.",
    "Pandas mostly eat bamboo.",
    "Flamingos get pink color from tiny food in the water.",
    "Polar bears have black skin under their pale fur.",
    "Rabbits' front teeth keep growing, so they need to chew.",
    "Chameleons can move their eyes in different directions.",
    "Starfish can move using many tiny tube feet.",
    "Bats are mammals, and many use sound to find food.",
    "Ducks have waterproof feathers.",
    "Gorillas build leafy nests to rest in.",
    "Lemurs use long tails for balance.",
    "Dragonflies can fly forward, backward, and hover.",
    "Ostriches are birds and can run very fast.",
    "A blue whale is the largest animal living today.",
    "Squirrels bury nuts and may help plant trees.",
    "Goats have rectangular pupils.",
    "Alpacas hum to communicate with each other.",
    "Meerkats take turns watching over the group.",
    "A frog's long back legs help it leap.",
    "A sheep's wool keeps growing until it is trimmed.",
    "A horse can sleep standing up for short rests.",
    "A mouse uses whiskers to feel in the dark.",
    "A seal has a thick layer of fat that helps it stay warm.",
    "A camel has long eyelashes that help keep sand away.",
    "A woodpecker has a strong beak for tapping trees.",
    "A peacock's bright tail feathers help it get noticed.",
    "A ladybug is a type of beetle.",
    "A moth can use its antennae to smell.",
    "A goat can climb steep rocky places.",
    "A parrot can copy sounds it hears.",
    "A squirrel's tail helps it balance on branches.",
    "A fish uses gills to take oxygen from water.",
    "A crab's hard outer shell is called an exoskeleton.",
    "Jellyfish are soft ocean animals.",
    "A sea horse is a fish with a curled tail.",
    "A koala mostly eats eucalyptus leaves.",
    "A sloth spends much of the day resting.",
    "A flamingo often stands on one leg.",
    "A cow has a special stomach system for digesting grass.",
    "A duck's webbed feet help it paddle.",
    "A bee has five eyes.",
    "A spider has eight legs.",
    "An octopus has eight arms.",
    "A butterfly begins life as a caterpillar.",
    "A tadpole grows into a frog.",
    "A chick hatches from an egg.",
    "A kitten is a baby cat.",
    "A puppy is a baby dog.",
    "A calf is a baby cow.",
    "A foal is a baby horse.",
    "A joey is a baby kangaroo.",
    "A cub can be a baby bear or a baby lion.",
    "A gosling is a baby goose.",
    "A cygnet is a baby swan.",
    "A duckling is a baby duck.",
    "A lamb is a baby sheep.",
    "A kid is a baby goat.",
    "A leveret is a baby hare.",
  ];
  const groups = [
    ["fish", "school"],
    ["dolphins", "pod"],
    ["lions", "pride"],
    ["wolves", "pack"],
    ["bees", "swarm"],
    ["ants", "colony"],
    ["birds", "flock"],
    ["sheep", "flock"],
    ["cows", "herd"],
    ["horses", "herd"],
    ["penguins", "colony"],
    ["elephants", "herd"],
    ["geese", "gaggle"],
    ["frogs", "army"],
    ["giraffes", "tower"],
    ["zebras", "dazzle"],
    ["owls", "parliament"],
    ["kangaroos", "mob"],
  ];
  for (const [animal, group] of groups) facts.push(`A group of ${animal} can be called a ${group}.`);
  const uses = [
    ["Elephants", "trunks", "pick up food and drink water"],
    ["Giraffes", "long tongues", "pull leaves from branches"],
    ["Penguins", "flippers", "steer while swimming"],
    ["Beavers", "flat tails", "help them swim and balance"],
    ["Kangaroos", "strong back legs", "hop far"],
    ["Otters", "webbed feet", "swim smoothly"],
    ["Owls", "large eyes", "see well in low light"],
    ["Cats", "whiskers", "feel tiny movements in air"],
    ["Dogs", "noses", "follow smells"],
    ["Frogs", "sticky tongues", "catch small insects"],
    ["Turtles", "shells", "keep their bodies safe"],
    ["Crabs", "claws", "hold food"],
    ["Butterflies", "long tubes", "sip nectar"],
    ["Hummingbirds", "fast wings", "hover near flowers"],
    ["Ducks", "webbed feet", "paddle in water"],
    ["Monkeys", "hands", "grab branches"],
    ["Lizards", "tails", "help them balance"],
    ["Snails", "tentacles", "sense the world around them"],
    ["Ants", "antennae", "touch and smell"],
    ["Seals", "flippers", "move through water"],
    ["Horses", "strong legs", "run over open ground"],
    ["Squirrels", "tails", "balance on narrow branches"],
    ["Parrots", "curved beaks", "crack seeds"],
    ["Camels", "wide feet", "walk on soft sand"],
  ];
  for (const [animal, part, use] of uses) facts.push(`${animal} use ${part} to ${use}.`);
  const classes = [
    ["Whales", "mammals, not fish"],
    ["Bats", "mammals, even though they can fly"],
    ["Frogs", "amphibians"],
    ["Turtles", "reptiles"],
    ["Penguins", "birds"],
    ["Sharks", "fish"],
    ["Ladybugs", "beetles"],
    ["Sea horses", "fish"],
    ["Crocodiles", "reptiles"],
    ["Salamanders", "amphibians"],
    ["Ostriches", "birds"],
    ["Dolphins", "mammals"],
    ["Lemurs", "primates"],
    ["Octopuses", "mollusks"],
    ["Crabs", "crustaceans"],
    ["Spiders", "arachnids"],
    ["Butterflies", "insects"],
    ["Snails", "mollusks"],
  ];
  for (const [animal, kind] of classes) facts.push(`${animal} are ${kind}.`);
  const senses = [
    ["A dog", "can smell far better than a human"],
    ["An owl", "can turn its head very far to look around"],
    ["A cat", "can see well in dim light"],
    ["A bee", "can see some colors humans cannot"],
    ["A snake", "smells with its tongue"],
    ["A fish", "can feel movement in water"],
    ["A bat", "can use echoes to fly in the dark"],
    ["A horse", "has eyes on the sides of its head"],
    ["A rabbit", "can listen with long ears"],
    ["A moth", "can smell with its antennae"],
    ["A seal", "uses whiskers to sense water movement"],
    ["A dolphin", "uses clicks to explore underwater"],
    ["A goat", "can see a wide view around it"],
    ["A spider", "can feel tiny vibrations"],
    ["A hummingbird", "can see bright flower colors"],
    ["A turtle", "can feel through its shell"],
  ];
  for (const [animal, sense] of senses) facts.push(`${animal} ${sense}.`);
  return uniq(facts);
}

function spaceFacts(): string[] {
  const facts = [
    "The Sun is a star.",
    "Earth is a rocky planet.",
    "The Moon reflects sunlight.",
    "The Moon does not make its own light.",
    "A planet moves around a star.",
    "An orbit is the path an object follows around another object.",
    "A year on Earth is one trip around the Sun.",
    "A day on Earth is one full spin.",
    "A telescope helps us see faraway space objects.",
    "Stars are giant balls of hot gas.",
    "The Milky Way is the galaxy where our solar system lives.",
    "A galaxy is a huge group of stars.",
    "Comets are icy objects that orbit the Sun.",
    "Asteroids are rocky objects that orbit the Sun.",
    "A meteor is a streak of light in the sky.",
    "Astronauts train carefully before going to space.",
    "Space suits help astronauts breathe and stay comfortable.",
    "The International Space Station orbits Earth.",
    "Rockets need strong engines to leave Earth.",
    "Rovers are robot explorers that can drive on other worlds.",
    "Mars has the largest known volcano in the solar system.",
    "Saturn's rings are made mostly of ice and rock pieces.",
    "Jupiter has a giant red storm called the Great Red Spot.",
    "Venus is the hottest planet in our solar system.",
    "Mercury is the closest planet to the Sun.",
    "Neptune is the farthest known planet from the Sun.",
    "Uranus spins on its side compared with most planets.",
    "Jupiter is the largest planet in our solar system.",
    "Mercury is the smallest planet in our solar system.",
    "Earth has one natural moon.",
    "Mars has two small moons.",
    "Saturn has more than one ring.",
    "The Sun gives Earth light and warmth.",
    "Light from the Sun takes about eight minutes to reach Earth.",
    "A light-year measures distance, not time.",
    "The solar system formed about 4.6 billion years ago.",
    "The Kuiper Belt is a region beyond Neptune.",
    "Pluto is a dwarf planet.",
    "Dwarf planets orbit the Sun too.",
    "The Moon has mountains and flat plains.",
    "The Moon has many craters.",
    "A solar eclipse happens when the Moon passes in front of the Sun.",
    "A lunar eclipse happens when Earth shades the Moon.",
    "Earth's gravity helps hold the Moon in orbit.",
    "The Sun is much bigger than Earth.",
    "The Moon is much smaller than Earth.",
    "Space probes send pictures and data back to Earth.",
    "Satellites can help us study weather on Earth.",
    "Some satellites help phones and maps work.",
    "A constellation is a pattern people see in stars.",
    "The North Star is also called Polaris.",
    "Our solar system has eight planets.",
    "The inner planets are rocky worlds.",
    "The outer planets are giant worlds.",
    "Jupiter and Saturn are gas giants.",
    "Uranus and Neptune are ice giants.",
    "Mars looks red because of rusty dust in its soil.",
    "Earth is the only planet known to have living things.",
    "The Moon's gravity helps make ocean tides.",
    "A full Moon happens when we see its whole bright side.",
    "A new Moon happens when the bright side faces away from us.",
    "The Sun's surface is much cooler than its center.",
    "The solar wind is a stream of particles from the Sun.",
    "Auroras can glow near Earth's poles.",
    "Meteor showers happen when Earth passes through comet dust.",
    "Mercury has many craters.",
    "Venus has thick clouds.",
    "Earth's atmosphere is mostly nitrogen and oxygen.",
    "Mars has seasons like Earth.",
    "Jupiter has faint rings.",
    "Uranus has faint rings.",
    "Neptune has faint rings.",
    "The asteroid belt lies between Mars and Jupiter.",
    "Ceres is a dwarf planet in the asteroid belt.",
    "Comet tails point away from the Sun.",
    "The Sun is at the center of our solar system.",
    "Earth's atmosphere helps protect living things.",
    "A moon is a natural object that orbits a planet.",
    "Gravity helps make planets round.",
    "The Moon takes about a month to go around Earth.",
    "The Moon shows Earth nearly the same side all the time.",
    "A spacesuit is like a tiny spacecraft for an astronaut.",
    "The Hubble Space Telescope orbits Earth.",
    "The James Webb Space Telescope observes infrared light.",
    "Microgravity is the floaty feeling astronauts have in orbit.",
    "Stars can be different colors.",
    "Blue stars are very hot.",
    "Red stars are cooler than blue stars.",
    "Our Sun is a medium-sized star.",
    "A spacesuit helmet has a visor to protect the eyes.",
    "Solar panels can turn sunlight into electricity.",
    "Mars rovers use wheels to drive over rocks.",
    "Lunar means related to the Moon.",
    "Solar means related to the Sun.",
    "A launch pad is where a rocket starts its trip.",
  ];
  const planets = [
    ["Mercury", "first", "rocky", "has no rings"],
    ["Venus", "second", "rocky", "has thick clouds"],
    ["Earth", "third", "rocky", "has liquid water on its surface"],
    ["Mars", "fourth", "rocky", "has dusty red ground"],
    ["Jupiter", "fifth", "gas giant", "has many moons"],
    ["Saturn", "sixth", "gas giant", "has bright rings"],
    ["Uranus", "seventh", "ice giant", "spins on its side"],
    ["Neptune", "eighth", "ice giant", "has strong winds"],
  ];
  for (const [name, order, type, trait] of planets) {
    facts.push(`${name} is the ${order} planet from the Sun.`);
    facts.push(`${name} is a ${type} planet.`);
    facts.push(`${name} ${trait}.`);
  }
  const moons = [
    ["Europa", "is an icy moon of Jupiter"],
    ["Ganymede", "is the largest moon in our solar system"],
    ["Titan", "is a large moon of Saturn"],
    ["Triton", "is a moon of Neptune"],
    ["Phobos", "is a small moon of Mars"],
    ["Deimos", "is a small moon of Mars"],
    ["Callisto", "is a large moon of Jupiter"],
    ["Io", "is a moon of Jupiter with many volcanoes"],
    ["Enceladus", "is an icy moon of Saturn"],
    ["Charon", "is Pluto's largest moon"],
  ];
  for (const [name, fact] of moons) facts.push(`${name} ${fact}.`);
  const tools = [
    ["Hubble", "is a space telescope"],
    ["James Webb", "is a space telescope"],
    ["Perseverance", "is a rover on Mars"],
    ["Curiosity", "is a rover on Mars"],
    ["Voyager 1", "is a far-traveling space probe"],
    ["Voyager 2", "visited the outer planets"],
    ["New Horizons", "took close pictures of Pluto"],
    ["Juno", "studies Jupiter"],
    ["Cassini", "studied Saturn"],
    ["Parker Solar Probe", "studies the Sun"],
  ];
  for (const [name, fact] of tools) facts.push(`${name} ${fact}.`);
  const sizes = [
    ["Mercury", "smaller than Earth"],
    ["Venus", "almost the same size as Earth"],
    ["Mars", "smaller than Earth"],
    ["Jupiter", "wider than all the other planets"],
    ["Saturn", "wide and famous for rings"],
    ["Uranus", "larger than Earth"],
    ["Neptune", "larger than Earth"],
    ["The Moon", "about one quarter as wide as Earth"],
    ["The Sun", "far wider than Earth"],
    ["Pluto", "smaller than Earth's Moon"],
  ];
  for (const [body, fact] of sizes) facts.push(`${body} is ${fact}.`);
  return uniq(facts);
}

function dinosaurFacts(): string[] {
  const facts = [
    "Dinosaurs lived long before people.",
    "Many dinosaurs hatched from eggs.",
    "Fossils are rock clues from long ago.",
    "Paleontologists are scientists who study fossils.",
    "Some dinosaurs walked on two legs.",
    "Some dinosaurs walked on four legs.",
    "Some dinosaurs had feathers.",
    "Modern birds are part of the dinosaur family tree.",
    "Fossil footprints can show how dinosaurs walked.",
    "Dinosaur eggs came in many shapes and sizes.",
    "Not every prehistoric reptile was a dinosaur.",
    "Pterosaurs flew, but they were not dinosaurs.",
    "Sea reptiles swam, but they were not dinosaurs.",
    "The Mesozoic Era had Triassic, Jurassic, and Cretaceous times.",
    "Plant-eating dinosaurs often had teeth for slicing plants.",
    "Some dinosaurs used long necks to reach plants.",
    "Some dinosaurs had bony plates or armor.",
    "Some dinosaurs had crests on their heads.",
    "Tiny fossils can teach big stories.",
    "Dinosaur bones can turn into fossils over time.",
    "A dinosaur trackway is a path of fossil footprints.",
    "Amber can sometimes hold tiny old plant or insect clues.",
    "A fossil tooth can tell what a dinosaur ate.",
    "A fossil nest can show where dinosaurs laid eggs.",
    "Dinosaur names often come from Greek or Latin words.",
    "Sauropods were long-necked dinosaurs.",
    "Theropods were mostly two-legged dinosaurs.",
    "Ceratopsians often had beaks and frills.",
    "Hadrosaurs are often called duck-billed dinosaurs.",
    "Ankylosaurs had armor-like body plates.",
    "Stegosaurs had plates along their backs.",
    "Birds share many features with small feathered dinosaurs.",
  ];
  const species = [
    ["Triceratops", "had three horns and a wide frill", "ate plants"],
    ["Stegosaurus", "had plates along its back", "ate plants"],
    ["Diplodocus", "had a long neck and a long tail", "ate plants"],
    ["Brachiosaurus", "had front legs longer than its back legs", "ate plants"],
    ["Apatosaurus", "was a long-necked sauropod", "ate plants"],
    ["Ankylosaurus", "had armor and a tail club", "ate plants"],
    ["Parasaurolophus", "had a long curved head crest", "ate plants"],
    ["Iguanodon", "had thumb spikes", "ate plants"],
    ["Corythosaurus", "had a tall helmet-like crest", "ate plants"],
    ["Pachycephalosaurus", "had a thick dome-shaped skull", "ate plants"],
    ["Kentrosaurus", "had plates and spikes along its body", "ate plants"],
    ["Gallimimus", "had long legs for fast running", "ate small foods and plants"],
    ["Ornithomimus", "looked a little like an ostrich", "ate small foods and plants"],
    ["Maiasaura", "is known from fossil nests", "ate plants"],
    ["Edmontosaurus", "was a duck-billed dinosaur", "ate plants"],
    ["Lambeosaurus", "had a hollow crest", "ate plants"],
    ["Styracosaurus", "had a frill with long spikes", "ate plants"],
    ["Protoceratops", "had a beak and a small frill", "ate plants"],
    ["Euoplocephalus", "had body armor", "ate plants"],
    ["Nodosaurus", "had bony armor", "ate plants"],
    ["Camptosaurus", "walked on two or four legs", "ate plants"],
    ["Plateosaurus", "was an early long-necked dinosaur", "ate plants"],
    ["Massospondylus", "was an early sauropodomorph", "ate plants"],
    ["Mamenchisaurus", "had an extra-long neck", "ate plants"],
    ["Argentinosaurus", "was a giant sauropod", "ate plants"],
    ["Dreadnoughtus", "was a huge long-necked dinosaur", "ate plants"],
    ["Amargasaurus", "had tall neck spines", "ate plants"],
    ["Therizinosaurus", "had very long claws", "ate plants"],
    ["Oviraptor", "had a beak", "probably cared for eggs"],
    ["Velociraptor", "was about the size of a turkey", "had feathers"],
    ["Microraptor", "was a small feathered dinosaur", "had wings on arms and legs"],
    ["Compsognathus", "was a small dinosaur", "walked on two legs"],
    ["Troodon", "had large eyes", "walked on two legs"],
    ["Archaeopteryx", "had feathers and wings", "is close to early birds"],
    ["Tyrannosaurus rex", "walked on two powerful legs", "had a strong tail for balance"],
    ["Allosaurus", "walked on two legs", "lived before T. rex"],
    ["Spinosaurus", "had a tall sail on its back", "spent time near water"],
    ["Baryonyx", "had a long narrow snout", "ate fish"],
    ["Suchomimus", "had a crocodile-like snout", "ate fish"],
    ["Ceratosaurus", "had a small horn on its nose", "walked on two legs"],
    ["Dilophosaurus", "had two crests on its head", "walked on two legs"],
    ["Coelophysis", "was an early dinosaur", "had a light body"],
    ["Carnotaurus", "had small horns above its eyes", "walked on two legs"],
    ["Deinonychus", "had a curved toe claw", "was a feathered dinosaur"],
    ["Hypsilophodon", "was a small plant eater", "had long back legs"],
    ["Psittacosaurus", "had a parrot-like beak", "ate plants"],
    ["Mussaurus", "had a name that means mouse lizard", "started life very small"],
    ["Scelidosaurus", "had bony armor", "ate plants"],
    ["Leaellynasaura", "had large eyes", "lived in ancient Australia"],
  ];
  for (const [name, trait, diet] of species) {
    facts.push(`${name} ${trait}.`);
    facts.push(`${name} ${diet}.`);
  }
  const places = [
    ["Triceratops", "North America"],
    ["Stegosaurus", "North America"],
    ["Diplodocus", "North America"],
    ["Brachiosaurus", "North America and Africa"],
    ["Iguanodon", "Europe"],
    ["Velociraptor", "Asia"],
    ["Spinosaurus", "Africa"],
    ["Argentinosaurus", "South America"],
    ["Mamenchisaurus", "Asia"],
    ["Leaellynasaura", "Australia"],
    ["Plateosaurus", "Europe"],
    ["Coelophysis", "North America"],
  ];
  for (const [name, place] of places) facts.push(`${name} fossils have been found in ${place}.`);
  return uniq(facts);
}

function bodyFacts(): string[] {
  const facts = [
    "Your heart is a strong muscle.",
    "Your lungs help bring oxygen into your body.",
    "Your brain sends messages through nerves.",
    "Your skin is the body's largest organ.",
    "Your tongue helps you taste, talk, and move food.",
    "Your eyes blink to stay clean and moist.",
    "Your ears help you hear and keep your balance.",
    "Your nose helps you smell and breathe.",
    "Your teeth help break food into smaller pieces.",
    "Saliva helps make food soft and easier to swallow.",
    "Your stomach mixes food with digestive juices.",
    "Your intestines help your body take in nutrients.",
    "Your skeleton helps hold up your body.",
    "Muscles work with bones to help you move.",
    "An adult skeleton usually has 206 bones.",
    "The human body has more than 650 muscles.",
    "Your ribs help protect your heart and lungs.",
    "Your skull helps protect your brain.",
    "Bones are living tissue.",
    "Bones contain minerals that help make them strong.",
    "Your spine is made of many small bones.",
    "Your shoulder joint helps your arm move many ways.",
    "Your knee is one of the largest joints in your body.",
    "Your ankle helps your foot bend and balance.",
    "Your fingers have no muscles inside them.",
    "Tendons help connect muscles to bones.",
    "Ligaments help connect bones to other bones.",
    "Cartilage helps cushion some joints.",
    "Tiny red cells help carry oxygen around your body.",
    "Tiny white cells help your body stay healthy.",
    "Your heart helps move oxygen around your body.",
    "Your heart has four chambers.",
    "Your heart beats faster when you run.",
    "Exercise can make muscles stronger.",
    "Sleep helps your body rest and grow.",
    "Water helps your body work well.",
    "Sweat helps cool your body.",
    "Hair helps protect parts of your skin.",
    "Fingernails are made of keratin.",
    "Your eyelashes help keep dust away from your eyes.",
    "Your eyebrows help move sweat away from your eyes.",
    "Your pupils change size to control light.",
    "Your iris is the colored part of your eye.",
    "Your eardrum vibrates when sound reaches it.",
    "Tiny bones in your ear help carry sound.",
    "Taste buds help you sense flavors.",
    "Your nose can smell many different scents.",
    "Your brain uses both eyes to judge distance.",
    "Your mouth starts digestion before food reaches your stomach.",
    "Your liver helps process nutrients.",
    "Your kidneys help clean extra water from your body.",
    "Your bladder stores urine until bathroom time.",
    "Your lungs have tiny air sacs called alveoli.",
    "Your diaphragm helps you breathe in and out.",
    "Your voice comes from vibrating vocal cords.",
    "Your brain has left and right halves.",
    "The cerebellum helps with balance and movement.",
    "Your nerves carry messages very quickly.",
    "Your bones grow as you grow.",
    "Baby teeth make space for adult teeth.",
    "Most kids have 20 baby teeth.",
    "Most adults have 32 teeth.",
    "Your hand has many small bones.",
    "Your foot has many small bones.",
    "Your thumb helps you grip things.",
    "Your skin helps you feel touch, heat, and cold.",
    "Goosebumps happen when tiny skin muscles tighten.",
    "Your body makes new skin cells all the time.",
    "Your hair grows from tiny pockets called follicles.",
    "Your brain uses energy from food.",
    "Your body uses calcium to help build strong bones.",
    "Vitamin D helps your body use calcium.",
    "Your body turns food into energy.",
    "Breathing brings oxygen in and moves carbon dioxide out.",
    "Your heart pumps through tubes called vessels.",
    "Your brain is protected by your skull.",
    "Your ribs move a little when you breathe.",
    "Your lungs sit inside your chest.",
    "Your heart sits inside your chest.",
    "Your shoulder blades help your arms move.",
    "Your kneecap is also called the patella.",
    "Your wrist has eight small bones.",
    "Your spine helps protect the spinal cord.",
    "Your body has two lungs.",
    "Your body has two kidneys.",
    "Your liver is the largest solid organ inside your body.",
    "Your skin has tiny pores.",
    "Your fingerprints are unique.",
    "Your sense of smell helps you taste food.",
    "Your adult teeth replace baby teeth as you grow.",
    "Your jaw holds your lower teeth.",
    "Your collarbones connect your shoulders to your chest.",
    "Your shoulder is a ball-and-socket joint.",
    "Your hip is a ball-and-socket joint.",
    "Your elbow bends in one main direction.",
    "Cardiac muscle is the muscle in your heart.",
    "Skeletal muscles help you move on purpose.",
    "Smooth muscles help organs do quiet work.",
    "Your brain needs oxygen to work.",
    "Your body warms up when muscles work.",
    "Touch signals start in nerves in your skin.",
    "Your eyes make tiny movements when you read.",
    "Your ears can hear high and low sounds.",
    "Your bones store calcium.",
    "Bone marrow is inside some bones.",
    "Some bones make new cells for your body.",
  ];
  const bodyPairs = [
    ["The small intestine", "is longer than the large intestine"],
    ["The large intestine", "absorbs water from digested food"],
    ["The nose", "warms air before it reaches the lungs"],
    ["The mouth", "uses teeth and saliva to start digestion"],
    ["The tongue", "has muscles that help move food"],
    ["The spine", "helps you stand and bend"],
    ["The rib cage", "moves as you breathe"],
    ["The elbow", "works like a hinge"],
    ["The wrist", "helps your hand move"],
    ["The hip", "helps connect your legs to your body"],
    ["The heel bone", "is the largest bone in the foot"],
    ["The femur", "is the longest bone in the human body"],
    ["The kneecap", "helps protect the knee joint"],
    ["The brain", "controls thinking, movement, and feelings"],
    ["The heart", "keeps oxygen moving"],
    ["The lungs", "fill with air when you breathe in"],
    ["The stomach", "can stretch after a meal"],
    ["The skin", "helps keep water inside your body"],
    ["The ears", "turn sound waves into signals"],
    ["The eyes", "send picture signals to the brain"],
    ["The nose", "has tiny hairs that help filter dust"],
    ["The hand", "has an opposable thumb"],
    ["The foot", "helps absorb steps as you walk"],
    ["The tongue", "is covered with tiny bumps called papillae"],
  ];
  for (const [part, fact] of bodyPairs) facts.push(`${part} ${fact}.`);
  const actions = [
    ["When you breathe in", "your lungs expand"],
    ["When you blink", "tears spread over your eyes"],
    ["When you smile", "many face muscles work together"],
    ["When you chew", "your jaw muscles do the work"],
    ["When you jump", "leg muscles push against the ground"],
    ["When you read", "your eyes and brain work together"],
    ["When you listen", "your brain makes sense of sounds"],
    ["When you smell food", "your nose sends signals to your brain"],
    ["When you drink water", "your body can move nutrients around"],
    ["When you stretch", "muscles and tendons gently lengthen"],
    ["When you balance", "your eyes, ears, and muscles help"],
    ["When you sleep", "your body keeps doing important jobs"],
    ["When you learn", "your brain builds new connections"],
    ["When you laugh", "your breathing changes for a moment"],
    ["When you run", "your heart and lungs work harder"],
    ["When you write", "small hand muscles help guide the pencil"],
  ];
  for (const [start, rest] of actions) facts.push(`${start}, ${rest}.`);
  return uniq(facts);
}

function oceanFacts(): string[] {
  const facts = [
    "The ocean covers about 70% of Earth's surface.",
    "Most seawater is salty.",
    "The Pacific Ocean is the largest ocean.",
    "The Arctic Ocean is the smallest ocean.",
    "The ocean has waves, tides, and currents.",
    "Tides are the ocean rising and falling.",
    "The Moon helps pull ocean tides.",
    "Waves are often made by wind.",
    "Ocean currents move water around the planet.",
    "Warm currents can carry heat across the ocean.",
    "Cold currents can bring nutrients upward.",
    "Sunlight reaches the upper ocean best.",
    "The open ocean is called the pelagic zone.",
    "The seafloor has mountains and valleys.",
    "A coral reef is made by tiny animals.",
    "Coral reefs can be home to many kinds of fish.",
    "Kelp is a giant seaweed.",
    "Kelp forests grow in cool coastal water.",
    "Plankton can be tiny plants or tiny animals.",
    "Phytoplankton use sunlight to make food.",
    "Sea turtles breathe air.",
    "Whales are large ocean mammals.",
    "Dolphins are mammals, not fish.",
    "Octopuses have eight arms.",
    "A sea star can move with tiny tube feet.",
    "A crab has a hard outer shell.",
    "A lobster has claws and a hard shell.",
    "A clam has two shells.",
    "An oyster can make a pearl.",
    "A scallop can open and close its shell.",
    "A seahorse is a fish.",
    "Male seahorses carry the eggs.",
    "A clownfish can live among sea anemones.",
    "A parrotfish uses a beak-like mouth on coral.",
    "A manta ray has wide wing-like fins.",
    "A sea otter can float on its back.",
    "Sea otters use rocks to open some shellfish.",
    "Manatees are gentle plant-eating mammals.",
    "A walrus has long tusks and whiskers.",
    "A penguin swims with flippers.",
    "A squid has ten arms and tentacles together.",
    "A nautilus has a spiral shell.",
    "A jellyfish is not a fish.",
    "Seaweed is a kind of algae.",
    "Some algae are so tiny you need a microscope to see them.",
    "The ocean can look blue because water absorbs red light.",
    "Sea foam is made when waves mix air with water.",
    "A lagoon is a shallow body of water near the sea.",
    "An estuary is where river water meets seawater.",
    "Mangrove trees can grow in salty coastal water.",
    "Salt marshes are grassy wetlands near the coast.",
    "Sand is made of tiny bits of rock, shell, and coral.",
    "A tide pool can hold small sea animals between tides.",
    "Barnacles often stick to rocks, boats, or shells.",
    "A mussel can attach to rocks with strong threads.",
    "Sea sponges are animals.",
    "Some fish travel in schools.",
    "A school of fish can move like one big shape.",
    "Flying fish can glide above the water.",
    "Pufferfish can puff up with water or air.",
    "A whale shark is the largest fish.",
    "A blue whale is the largest animal.",
    "A narwhal has one long tooth that looks like a tusk.",
    "A sea cucumber is an ocean animal.",
    "A sand dollar is related to sea stars.",
    "A hermit crab often uses an empty shell as a home.",
    "A shell can protect a soft-bodied animal.",
    "The ocean stores a lot of heat from the Sun.",
    "Sea ice is frozen ocean water.",
    "Icebergs are made of freshwater ice.",
    "The Great Barrier Reef is the largest coral reef system.",
    "The Mariana Trench is the deepest known ocean trench.",
    "Sonar can help map the seafloor.",
    "Submarines can travel under ocean water.",
    "The Atlantic Ocean lies between the Americas and Europe and Africa.",
    "The Indian Ocean touches Asia, Africa, Australia, and Antarctica.",
    "The Southern Ocean surrounds Antarctica.",
    "The Arctic Ocean has lots of sea ice.",
    "Seawater has dissolved salts.",
    "Freshwater has much less salt than seawater.",
    "Waves can shape sandy beaches.",
    "Currents can carry floating seeds.",
    "A bay is ocean water partly surrounded by land.",
    "A gulf is a large area of ocean reaching into land.",
    "An island is land surrounded by water.",
    "A peninsula has water on three sides.",
    "A reef can slow waves near the shore.",
    "Coral polyps are tiny animals.",
    "Many shallow coral reefs need sunlight.",
    "Kelp can grow very tall underwater.",
    "Seagrass is a flowering plant that grows underwater.",
    "Mangrove roots can stand in salty water.",
    "Sea anemones are animals that look like flowers.",
    "Sea urchins move with tiny tube feet.",
    "Sea stars are not fish.",
    "A group of jellyfish can be called a bloom.",
    "A baby oyster is called a spat.",
    "Clams can dig into sand.",
    "Oysters often grow together on reefs.",
    "Mussels can filter tiny food from water.",
    "Barnacles are crustaceans.",
    "Plankton drift with water currents.",
    "Zooplankton are tiny drifting animals.",
    "Phytoplankton are tiny drifting algae.",
    "Many ocean animals use camouflage.",
    "A cuttlefish can change color.",
    "A squid can move by jetting water.",
    "An octopus can squeeze into small spaces.",
    "Dolphins use clicks and whistles.",
    "A whale calf drinks milk from its mother.",
    "Sea turtles return to land to lay eggs.",
    "Coral reefs grow slowly.",
    "The ocean floor is called the seabed.",
    "A ridge can be an underwater mountain chain.",
    "Deep-sea vents release warm mineral-rich water.",
    "The deep ocean is dark because sunlight fades with depth.",
    "Many deep-sea animals can make living light.",
    "Bioluminescence means living light.",
    "Saltwater can be denser than freshwater.",
    "Ocean water can have different temperatures.",
    "Sea level is the height of the ocean surface.",
    "Tide tables help people know when tides change.",
    "The shore is where land meets water.",
    "Beach sand can be many colors.",
    "Black sand can come from volcanic rock.",
    "White sand can come from coral or shells.",
  ];
  const oceans = [
    ["Pacific", "the largest"],
    ["Atlantic", "the second largest"],
    ["Indian", "warm in many tropical places"],
    ["Southern", "around Antarctica"],
    ["Arctic", "the smallest"],
  ];
  for (const [name, fact] of oceans) facts.push(`The ${name} Ocean is ${fact} ocean.`);
  const breathers = [
    "whales",
    "dolphins",
    "porpoises",
    "sea turtles",
    "seals",
    "sea lions",
    "walruses",
    "manatees",
    "dugongs",
    "sea otters",
  ];
  for (const animal of breathers) facts.push(`${cap(animal)} breathe air at the surface.`);
  const habitats = [
    ["coral reefs", "warm shallow seas"],
    ["kelp forests", "cool coastal seas"],
    ["tide pools", "rocky shores"],
    ["mangroves", "salty coastlines"],
    ["seagrass meadows", "sunny shallow water"],
    ["open ocean", "water far from land"],
    ["estuaries", "places where rivers meet the sea"],
    ["salt marshes", "grassy coastal wetlands"],
    ["sandy beaches", "shorelines shaped by waves"],
    ["deep sea vents", "dark seafloor places with warm water"],
  ];
  for (const [place, fact] of habitats) facts.push(`${cap(place)} are ${fact}.`);
  return uniq(facts);
}

function natureFacts(): string[] {
  const facts = [
    "Plants use sunlight, water, and air to make food.",
    "Leaves often look green because of chlorophyll.",
    "Roots help plants take in water from soil.",
    "Flowers can turn into fruits after pollination.",
    "Seeds can travel by wind, water, or animals.",
    "A seed has a tiny plant inside it.",
    "Trees add a new growth ring in many years.",
    "Moss can grow without true roots.",
    "Ferns make spores instead of seeds.",
    "Bamboo is a fast-growing grass.",
    "Cactus stems can store water.",
    "Pine trees make cones.",
    "Acorns are oak tree seeds.",
    "Maple seeds can spin like tiny helicopters.",
    "Sunflowers can turn toward light as they grow.",
    "A rainbow forms when sunlight bends in water drops.",
    "Clouds are made of tiny water drops or ice crystals.",
    "Wind is moving air.",
    "Rain is part of the water cycle.",
    "Snowflakes form from ice crystals in clouds.",
    "A snowflake usually has six sides.",
    "Fog is a cloud close to the ground.",
    "Dew is water that forms on cool surfaces.",
    "Hail is ice that forms inside storm clouds.",
    "Lightning is a giant spark of electricity.",
    "Thunder is the sound made by lightning.",
    "Rivers carry water downhill.",
    "A lake is water surrounded by land.",
    "A pond is usually smaller than a lake.",
    "A waterfall is water dropping from a high place.",
    "A glacier is a slow-moving river of ice.",
    "Soil is made from bits of rock and living matter.",
    "Earthworms mix soil as they tunnel.",
    "Fungi help break down old leaves and wood.",
    "Mushrooms are the fruiting parts of some fungi.",
    "Lichens are partnerships between fungi and algae.",
    "Rocks can be igneous, sedimentary, or metamorphic.",
    "Igneous rocks form from cooled melted rock.",
    "Sedimentary rocks form from layers of small pieces.",
    "Metamorphic rocks change under heat and pressure.",
    "Quartz is a common mineral.",
    "Granite is made of several minerals.",
    "Sandstone is made from sand grains pressed together.",
    "Limestone can form from shells and sea life pieces.",
    "The water cycle moves water around Earth.",
    "Evaporation turns liquid water into water vapor.",
    "Condensation helps clouds form.",
    "Precipitation means rain, snow, sleet, or hail.",
    "Transpiration is water vapor leaving plant leaves.",
    "The Sun powers much of Earth's weather.",
    "Seasons happen because Earth is tilted.",
    "Day and night happen because Earth spins.",
    "The equator gets strong sunlight all year.",
    "A habitat is a place where a living thing can live.",
    "An ecosystem includes living things and their surroundings.",
    "A food chain shows how energy moves through living things.",
    "Pollinators help move pollen between flowers.",
    "Bees are important pollinators.",
    "Butterflies can help pollinate flowers.",
    "Hummingbirds can pollinate some flowers.",
    "Bats can pollinate some night-blooming plants.",
    "Worms help make soil airier.",
    "Roots can help hold soil in place.",
    "Trees can give shade and homes to animals.",
    "Fallen leaves can become part of healthy soil.",
    "A forest has many trees growing together.",
    "A meadow is an open place with grasses and flowers.",
    "A desert is a dry habitat.",
    "A rainforest gets lots of rain.",
    "A tundra is a cold habitat with low plants.",
    "A prairie is a wide grassland.",
    "A mountain is a high landform.",
    "A valley is low land between higher places.",
    "A canyon is a deep valley with steep sides.",
    "A volcano is an opening where melted rock can reach the surface.",
    "Lava is melted rock on Earth's surface.",
    "A leaf has tiny openings called stomata.",
    "Stomata help leaves take in air.",
    "Chlorophyll helps leaves catch sunlight.",
    "A trunk supports a tree.",
    "Branches hold leaves toward light.",
    "Tree roots can spread wide underground.",
    "Pollen is a powder made by flowers and cones.",
    "Nectar is a sweet liquid made by some flowers.",
    "Fruit can help animals spread seeds.",
    "A burr seed can stick to fur or clothes.",
    "Dandelion seeds can float on the wind.",
    "Coconut seeds can float in seawater.",
    "A mushroom is not a plant.",
    "Fungi do not make food from sunlight.",
    "Mold is a type of fungus.",
    "A mineral is a natural nonliving solid.",
    "A crystal has an orderly shape inside.",
    "Weathering breaks rocks into smaller pieces.",
    "Erosion moves rock and soil pieces.",
    "A delta can form where a river meets a lake or sea.",
    "A wetland is land that stays wet often.",
    "A swamp is a type of wetland.",
    "A bog is a wetland with spongy ground.",
    "A savanna is grassland with scattered trees.",
    "A canopy is the leafy roof of a forest.",
    "A seedling is a young plant.",
    "A sapling is a young tree.",
    "Frost is ice crystals on a cold surface.",
    "Mist is tiny water drops in the air.",
    "Air pressure helps shape weather.",
    "The atmosphere is a blanket of gases around Earth.",
    "A breeze is a gentle wind.",
    "A thermometer measures temperature.",
    "A rain gauge measures rain.",
    "A barometer measures air pressure.",
    "A compass can show direction.",
    "North, south, east, and west are cardinal directions.",
    "The horizon is where sky and land seem to meet.",
  ];
  const plantParts = [
    ["Roots", "hold plants in soil"],
    ["Stems", "help hold up leaves and flowers"],
    ["Leaves", "make food for many plants"],
    ["Flowers", "help many plants make seeds"],
    ["Fruit", "can help protect and spread seeds"],
    ["Bark", "helps protect a tree trunk"],
    ["Cones", "hold seeds for pine trees"],
    ["Needles", "are leaves on many evergreen trees"],
    ["Petals", "can help attract pollinators"],
    ["Pollen", "helps flowering plants make seeds"],
  ];
  for (const [part, fact] of plantParts) facts.push(`${part} ${fact}.`);
  const cycles = [
    ["Water", "can be solid, liquid, or gas"],
    ["Clouds", "can carry water across the sky"],
    ["Rain", "can soak into soil"],
    ["Rivers", "can carry water to the ocean"],
    ["Sunlight", "helps water evaporate"],
    ["Ice", "can melt into liquid water"],
    ["Snow", "can store water in winter"],
    ["Plants", "release water vapor from leaves"],
    ["Wind", "can move seeds and clouds"],
    ["Soil", "can store water for plants"],
  ];
  for (const [thing, fact] of cycles) facts.push(`${thing} ${fact}.`);
  const rockFacts = [
    ["Pumice", "can float because it has many air holes"],
    ["Obsidian", "is natural volcanic glass"],
    ["Basalt", "often forms from lava"],
    ["Marble", "forms when limestone changes"],
    ["Slate", "can split into thin sheets"],
    ["Chalk", "is a soft kind of limestone"],
    ["Clay", "is made of very tiny mineral pieces"],
    ["Sand", "is made of tiny grains"],
    ["Pebbles", "are rounded by water or wind"],
    ["Crystals", "grow in repeating shapes"],
  ];
  for (const [thing, fact] of rockFacts) facts.push(`${thing} ${fact}.`);
  return uniq(facts);
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function factsByTheme(): Record<Theme, string[]> {
  return {
    animals: animalFacts(),
    space: spaceFacts(),
    dinosaurs: dinosaurFacts(),
    human_body: bodyFacts(),
    ocean: oceanFacts(),
    nature: natureFacts(),
  };
}

function sentenceCount(s: string): number {
  return s.split(/[.!?]+/).filter((part) => part.trim()).length;
}

function estimatedLines(s: string, charsPerLine: number): number {
  return Math.max(1, Math.ceil(s.length / charsPerLine));
}

function validateFact(theme: Theme, fact: string): void {
  const banned = /\b(dead|death|die|died|kill|killed|blood|scary|sad|war|poison|venom)\b/i;
  if (!fact.endsWith(".")) throw new Error(`${theme}: fact must end with a period: ${fact}`);
  if (fact.length > 128) throw new Error(`${theme}: fact too long (${fact.length}): ${fact}`);
  if (sentenceCount(fact) > 2) throw new Error(`${theme}: too many sentences: ${fact}`);
  if (banned.test(fact)) throw new Error(`${theme}: blocked tone word: ${fact}`);
  const lines = estimatedLines(HOOK, 22) + estimatedLines(fact, 31) + estimatedLines(CTA, 22);
  if (lines > 6) throw new Error(`${theme}: estimated ${lines} lines: ${fact}`);
}

function buildCards(count: number): PackCard[] {
  if (!Number.isInteger(count) || count <= 0) throw new Error(`Bad --count: ${count}`);
  const pools = factsByTheme();
  const need = Math.ceil(count / THEMES.length);
  for (const theme of THEMES) {
    const pool = pools[theme];
    for (const fact of pool) validateFact(theme, fact);
    if (pool.length < need) throw new Error(`${theme}: need ${need} facts, have ${pool.length}`);
  }
  const cards: PackCard[] = [];
  for (let i = 0; i < count; i++) {
    const theme = THEMES[i % THEMES.length];
    const fact = pools[theme][Math.floor(i / THEMES.length)];
    const template = TEMPLATE_SPECS[i % TEMPLATE_SPECS.length].key;
    cards.push({ id: i + 1, theme, template, hook: HOOK, fact, cta: CTA });
  }
  const duplicate = findDuplicate(cards.map((c) => c.fact));
  if (duplicate) throw new Error(`Duplicate fact: ${duplicate}`);
  return cards;
}

function findDuplicate(items: string[]): string | null {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item)) return item;
    seen.add(item);
  }
  return null;
}

async function clearJsonDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  for (const f of await readdir(dir)) {
    if (f.endsWith(".json")) await rm(resolve(dir, f));
  }
}

async function copyBackgrounds(): Promise<void> {
  await mkdir(BG_DIR, { recursive: true });
  for (const spec of TEMPLATE_SPECS) {
    const src = resolve(SOURCE_DIR, spec.file);
    if (!existsSync(src)) throw new Error(`Missing source template: ${src}`);
    await copyFile(src, resolve(BG_DIR, spec.file));
  }
}

function cardValues(card: PackCard): Record<string, string> {
  return { hook: card.hook, fact: card.fact, cta: card.cta };
}

function previewCards(cards: PackCard[]): PackCard[] {
  const sorted = [...cards].sort((a, b) => b.fact.length - a.fact.length);
  return TEMPLATE_SPECS.map((_, i) => sorted[i % sorted.length]);
}

async function renderQa(templates: PackTemplate[], cards: PackCard[]): Promise<void> {
  await mkdir(QA_DIR, { recursive: true });
  for (const f of await readdir(QA_DIR).catch(() => [])) {
    if (f.endsWith(".png")) await rm(resolve(QA_DIR, f));
  }
  const browser = await puppeteer.launch({
    executablePath: chromePath(),
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--font-render-hinting=none", "--hide-scrollbars"],
  });
  try {
    const picks = previewCards(cards);
    for (let i = 0; i < templates.length; i++) {
      const spec = TEMPLATE_SPECS[i];
      const card = picks[i];
      const out = resolve(QA_DIR, `${String(i + 1).padStart(2, "0")}-${spec.key}.png`);
      await renderTemplateCard(templates[i] as TemplateDoc, cardValues(card), out, browser);
      console.log(`qa ${String(i + 1).padStart(2, "0")} ${spec.key.padEnd(18)} len=${String(card.fact.length).padStart(3)} ${card.theme} -> ${out}`);
    }
  } finally {
    await browser.close();
  }
}

function seedLivePack(templates: PackTemplate[], cards: PackCard[]): void {
  const dbPath = resolve(process.cwd(), "data/app.db");
  if (!existsSync(dbPath)) throw new Error(`No app database found: ${dbPath}`);
  const db = new DatabaseSync(dbPath);
  const users = db.prepare("SELECT id, username, role FROM users ORDER BY id").all() as Array<{ id: number; username: string; role: string }>;
  db.close();
  const owner = users.find((u) => u.role === "admin") ?? users[0];
  if (!owner) throw new Error("No users in app.db; start the server once before seeding a live pack.");
  if (listPacks(owner.id, owner.role === "admin").some((p) => p.name === PACK_NAME)) {
    console.log(`live pack already exists for #${owner.id} ${owner.username}; skipping seed`);
    return;
  }
  const pack = createPack(owner.id, { name: PACK_NAME, lang: "en", templates });
  const added = addCards(pack.id, owner.id, owner.role === "admin", cards.map(cardValues));
  if (!added.ok) throw new Error(`Could not add cards to live pack: ${JSON.stringify(added)}`);
  console.log(`live pack: ${pack.id} owner=#${owner.id} ${owner.username} cards=${added.total}`);
}

async function main(): Promise<void> {
  await mkdir(PACK_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });
  await copyBackgrounds();
  await clearJsonDir(TEMPLATE_DIR);

  const templates = TEMPLATE_SPECS.map(makeTemplate);
  const cards = buildCards(COUNT);
  for (let i = 0; i < templates.length; i++) {
    await writeFile(resolve(TEMPLATE_DIR, `${String(i + 1).padStart(2, "0")}-${TEMPLATE_SPECS[i].key}.json`), JSON.stringify(templates[i], null, 2) + "\n");
  }
  await writeFile(resolve(PACK_DIR, "cards.json"), JSON.stringify(cards, null, 2) + "\n");
  await writeFile(
    resolve(PACK_DIR, "manifest.json"),
    JSON.stringify(
      {
        name: PACK_NAME,
        lang: "en",
        count: cards.length,
        templates: TEMPLATE_SPECS.map((s) => s.key),
        themes: THEMES,
        structure: { hook: HOOK, fact: "1-2 short true kid-safe sentences", cta: CTA },
        sourceTemplates: SOURCE_DIR,
      },
      null,
      2,
    ) + "\n",
  );

  await renderQa(templates, cards);
  if (SEED) seedLivePack(templates, cards);

  const counts = Object.fromEntries(THEMES.map((theme) => [theme, cards.filter((c) => c.theme === theme).length]));
  console.log(`templates: ${templates.length} -> ${TEMPLATE_DIR}`);
  console.log(`cards: ${cards.length} -> ${resolve(PACK_DIR, "cards.json")}`);
  console.log(`theme counts: ${JSON.stringify(counts)}`);
  console.log(`qa previews -> ${QA_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
