import type { PaintShade } from './models';

// Original card defaults. Saved admin edits take precedence.
const card = [
  {
    "code": "WW 0029",
    "name": "Jasmine",
    "family": "Whites and Neutrals",
    "color": "#f5f2e8"
  },
  {
    "code": "WW 0001",
    "name": "River Rapids",
    "family": "Whites and Neutrals",
    "color": "#f3f4f2"
  },
  {
    "code": "WW 0012",
    "name": "Alabaster",
    "family": "Whites and Neutrals",
    "color": "#e8e6e3"
  },
  {
    "code": "WW 0038",
    "name": "Starched Aprons",
    "family": "Whites and Neutrals",
    "color": "#eae4d9"
  },
  {
    "code": "WW 0034",
    "name": "Kora Kaagaz",
    "family": "Whites and Neutrals",
    "color": "#eeeae2"
  },
  {
    "code": "WW 0060",
    "name": "Bread Butter Sandwich",
    "family": "Whites and Neutrals",
    "color": "#ede4d7"
  },
  {
    "code": "NN 9000",
    "name": "People Magnet",
    "family": "Whites and Neutrals",
    "color": "#e7dbbe"
  },
  {
    "code": "WW 0026",
    "name": "Steamed Idlis",
    "family": "Whites and Neutrals",
    "color": "#f0e9d9"
  },
  {
    "code": "NN 9097",
    "name": "My Book of Hymns",
    "family": "Whites and Neutrals",
    "color": "#e7d8bf"
  },
  {
    "code": "NN 9090",
    "name": "History Textbooks",
    "family": "Whites and Neutrals",
    "color": "#cec5b7"
  },
  {
    "code": "NN 9497",
    "name": "Pandemic Pals",
    "family": "Whites and Neutrals",
    "color": "#d6d2c3"
  },
  {
    "code": "NN 9416",
    "name": "A Satisfactory Haggle",
    "family": "Whites and Neutrals",
    "color": "#c2c8c8"
  },
  {
    "code": "NN 9586",
    "name": "Hushing a Dream",
    "family": "Whites and Neutrals",
    "color": "#c2c3bf"
  },
  {
    "code": "NN 9547",
    "name": "Cuba Libre",
    "family": "Whites and Neutrals",
    "color": "#bab8b7"
  },
  {
    "code": "NN 9531",
    "name": "It might Rain Today",
    "family": "Whites and Neutrals",
    "color": "#bbb1ac"
  },
  {
    "code": "NN 9044",
    "name": "Sahibs at Hunt",
    "family": "Whites and Neutrals",
    "color": "#caa77f"
  },
  {
    "code": "NN 9156",
    "name": "On the Prowl",
    "family": "Whites and Neutrals",
    "color": "#b98a69"
  },
  {
    "code": "NN 9100",
    "name": "Brown Paper Packages",
    "family": "Whites and Neutrals",
    "color": "#cbaa8b"
  },
  {
    "code": "NN 9260",
    "name": "Light Roast",
    "family": "Whites and Neutrals",
    "color": "#a67f66"
  },
  {
    "code": "NN 9180",
    "name": "Baked Terracotta",
    "family": "Whites and Neutrals",
    "color": "#af8472"
  },
  {
    "code": "NN 9164",
    "name": "Manzil",
    "family": "Whites and Neutrals",
    "color": "#b29784"
  },
  {
    "code": "YY 1000",
    "name": "Pineapple Juice",
    "family": "Yellows and Oranges",
    "color": "#f5edc5"
  },
  {
    "code": "YY 1104",
    "name": "Chalk",
    "family": "Yellows and Oranges",
    "color": "#f9edd3"
  },
  {
    "code": "YR 2064",
    "name": "Sheer Curtains",
    "family": "Yellows and Oranges",
    "color": "#f9e4cf"
  },
  {
    "code": "NN 9034",
    "name": "Bananas on Toast",
    "family": "Yellows and Oranges",
    "color": "#e6d4b4"
  },
  {
    "code": "YY 1057",
    "name": "Just Woke Up",
    "family": "Yellows and Oranges",
    "color": "#fde8b6"
  },
  {
    "code": "YR 2105",
    "name": "Family Heirloom",
    "family": "Yellows and Oranges",
    "color": "#ebccb5"
  },
  {
    "code": "NN 9051",
    "name": "Puddles of Light",
    "family": "Yellows and Oranges",
    "color": "#cab489"
  },
  {
    "code": "YY 1099",
    "name": "Pineapple Upside Down",
    "family": "Yellows and Oranges",
    "color": "#f5d081"
  },
  {
    "code": "YR 2106",
    "name": "Sunset in Winter",
    "family": "Yellows and Oranges",
    "color": "#f5c6a3"
  },
  {
    "code": "YY 1123",
    "name": "Follow the Sun",
    "family": "Yellows and Oranges",
    "color": "#d8bc85"
  },
  {
    "code": "YR 2035",
    "name": "Silken Sheen",
    "family": "Yellows and Oranges",
    "color": "#e0b577"
  },
  {
    "code": "NN 9155",
    "name": "Holiday Glow",
    "family": "Yellows and Oranges",
    "color": "#cd9776"
  },
  {
    "code": "YY 1011",
    "name": "Pale Gold",
    "family": "Yellows and Oranges",
    "color": "#f1d883"
  },
  {
    "code": "YR 2019",
    "name": "Boiled Sweets",
    "family": "Yellows and Oranges",
    "color": "#e8b782"
  },
  {
    "code": "YR 2125",
    "name": "A Box of Files",
    "family": "Yellows and Oranges",
    "color": "#d79468"
  },
  {
    "code": "YY 1012",
    "name": "Yellow Warbler",
    "family": "Yellows and Oranges",
    "color": "#f3d763"
  },
  {
    "code": "YR 2052",
    "name": "Deep Mustard",
    "family": "Yellows and Oranges",
    "color": "#e0ad62"
  },
  {
    "code": "YR 2206",
    "name": "Annatto Seeds",
    "family": "Yellows and Oranges",
    "color": "#d07a62"
  },
  {
    "code": "YY 1803",
    "name": "English Mustard",
    "family": "Yellows and Oranges",
    "color": "#e0ae43"
  },
  {
    "code": "YR 2094",
    "name": "Fields of Pumpkins",
    "family": "Yellows and Oranges",
    "color": "#d58644"
  },
  {
    "code": "YR 2173",
    "name": "Pickled Carrots",
    "family": "Yellows and Oranges",
    "color": "#d06d4c"
  },
  {
    "code": "NN 9265",
    "name": "Floating Flowers",
    "family": "Reds and Purples",
    "color": "#f2e0d8"
  },
  {
    "code": "NN 9272",
    "name": "Soft Talcum",
    "family": "Reds and Purples",
    "color": "#e7dbdb"
  },
  {
    "code": "PP 4153",
    "name": "Kindered Spirit",
    "family": "Reds and Purples",
    "color": "#ccc9d8"
  },
  {
    "code": "RR 3067",
    "name": "Post Modern Pink",
    "family": "Reds and Purples",
    "color": "#e5b1aa"
  },
  {
    "code": "PP 4074",
    "name": "Winter Garden",
    "family": "Reds and Purples",
    "color": "#dfb4bf"
  },
  {
    "code": "PP 4193",
    "name": "Satin Scarf",
    "family": "Reds and Purples",
    "color": "#c7cbe4"
  },
  {
    "code": "NN 9277",
    "name": "Toppled Carts",
    "family": "Reds and Purples",
    "color": "#bf8982"
  },
  {
    "code": "NN 9323",
    "name": "Light Champagne Pink",
    "family": "Reds and Purples",
    "color": "#c19ba4"
  },
  {
    "code": "PP 4202",
    "name": "Dayflower",
    "family": "Reds and Purples",
    "color": "#afbade"
  },
  {
    "code": "RR 3068",
    "name": "Jaipur Red",
    "family": "Reds and Purples",
    "color": "#cd8077"
  },
  {
    "code": "RR 3179",
    "name": "Begonias",
    "family": "Reds and Purples",
    "color": "#d294a0"
  },
  {
    "code": "PP 4164",
    "name": "Grandeur",
    "family": "Reds and Purples",
    "color": "#8783b0"
  },
  {
    "code": "RR 3050",
    "name": "Rose Dust",
    "family": "Reds and Purples",
    "color": "#cb6b6d"
  },
  {
    "code": "PP 4067",
    "name": "Onion Pink",
    "family": "Reds and Purples",
    "color": "#cc839f"
  },
  {
    "code": "PP 4165",
    "name": "Brinjal Flowers",
    "family": "Reds and Purples",
    "color": "#716b98"
  },
  {
    "code": "RR 3125",
    "name": "Dull Maroon",
    "family": "Reds and Purples",
    "color": "#a8575d"
  },
  {
    "code": "NN 9326",
    "name": "Akbar's Rose Garden",
    "family": "Reds and Purples",
    "color": "#9d6979"
  },
  {
    "code": "PP 4803",
    "name": "Glory Bush",
    "family": "Reds and Purples",
    "color": "#6b528a"
  },
  {
    "code": "RR 3053",
    "name": "A Painting in Thiksey",
    "family": "Reds and Purples",
    "color": "#b04240"
  },
  {
    "code": "PP 4078",
    "name": "Dark Dahlias",
    "family": "Reds and Purples",
    "color": "#966882"
  },
  {
    "code": "PP 4150",
    "name": "Holy Basil",
    "family": "Reds and Purples",
    "color": "#704b77"
  },
  {
    "code": "BB 5008",
    "name": "The Clouds have Shapes",
    "family": "Blues and Blue-Greens",
    "color": "#d6dcef"
  },
  {
    "code": "BB 5104",
    "name": "Harps in Heaven",
    "family": "Blues and Blue-Greens",
    "color": "#d7e5ed"
  },
  {
    "code": "BG 6009",
    "name": "Lonely Cloud",
    "family": "Blues and Blue-Greens",
    "color": "#bddce3"
  },
  {
    "code": "BB 5018",
    "name": "Dusky Indigo",
    "family": "Blues and Blue-Greens",
    "color": "#b6c3e2"
  },
  {
    "code": "BB 5073",
    "name": "Eternally Elegant",
    "family": "Blues and Blue-Greens",
    "color": "#a4cbee"
  },
  {
    "code": "BG 6106",
    "name": "Almost Blue",
    "family": "Blues and Blue-Greens",
    "color": "#a8c9ca"
  },
  {
    "code": "BB 5050",
    "name": "December Mornings",
    "family": "Blues and Blue-Greens",
    "color": "#a7bfe6"
  },
  {
    "code": "BB 5090",
    "name": "Easy Hope",
    "family": "Blues and Blue-Greens",
    "color": "#92c9eb"
  },
  {
    "code": "BG 6172",
    "name": "Light and Leaf",
    "family": "Blues and Blue-Greens",
    "color": "#94c6b5"
  },
  {
    "code": "BB 5010",
    "name": "A Cool Plunge",
    "family": "Blues and Blue-Greens",
    "color": "#9eacd1"
  },
  {
    "code": "BB 5075",
    "name": "By the Lakeside",
    "family": "Blues and Blue-Greens",
    "color": "#74a8d8"
  },
  {
    "code": "BG 6108",
    "name": "Summer Sea",
    "family": "Blues and Blue-Greens",
    "color": "#529b96"
  },
  {
    "code": "BB 5002",
    "name": "Cornflowers are Blue",
    "family": "Blues and Blue-Greens",
    "color": "#a4aee2"
  },
  {
    "code": "BB 5100",
    "name": "Forget-Me-Nots",
    "family": "Blues and Blue-Greens",
    "color": "#6d9bc4"
  },
  {
    "code": "BG 6013",
    "name": "Malabar Coast",
    "family": "Blues and Blue-Greens",
    "color": "#3c90a0"
  },
  {
    "code": "BB 5021",
    "name": "Old Ink Pen",
    "family": "Blues and Blue-Greens",
    "color": "#6e789f"
  },
  {
    "code": "BB 5124",
    "name": "Ferry to Panjim",
    "family": "Blues and Blue-Greens",
    "color": "#567ead"
  },
  {
    "code": "BB 5190",
    "name": "Picasso's Blue Period",
    "family": "Blues and Blue-Greens",
    "color": "#008fb0"
  },
  {
    "code": "BB 5046",
    "name": "Kutchi Night",
    "family": "Blues and Blue-Greens",
    "color": "#4d5d7f"
  },
  {
    "code": "BB 5111",
    "name": "Salvador Do Mundo",
    "family": "Blues and Blue-Greens",
    "color": "#3e6491"
  },
  {
    "code": "BB 5175",
    "name": "Peacock's Rain Dance",
    "family": "Blues and Blue-Greens",
    "color": "#0f6d8e"
  },
  {
    "code": "GG 7144",
    "name": "Softened Green",
    "family": "Greens and Yellow-Greens",
    "color": "#e4eae0"
  },
  {
    "code": "GG 7128",
    "name": "Canopy Shyness",
    "family": "Greens and Yellow-Greens",
    "color": "#dce7cf"
  },
  {
    "code": "YG 8113",
    "name": "Cane Juice",
    "family": "Greens and Yellow-Greens",
    "color": "#ded8a5"
  },
  {
    "code": "GG 7050",
    "name": "Delicate Pea",
    "family": "Greens and Yellow-Greens",
    "color": "#ccdad0"
  },
  {
    "code": "GG 7096",
    "name": "Goodbye Winter",
    "family": "Greens and Yellow-Greens",
    "color": "#d0e8c6"
  },
  {
    "code": "YG 8075",
    "name": "Green Tea",
    "family": "Greens and Yellow-Greens",
    "color": "#dad390"
  },
  {
    "code": "GG 7149",
    "name": "Green Fairy",
    "family": "Greens and Yellow-Greens",
    "color": "#a4b6a1"
  },
  {
    "code": "GG 7113",
    "name": "Patch of Gourds",
    "family": "Greens and Yellow-Greens",
    "color": "#bbd59d"
  },
  {
    "code": "YG 8114",
    "name": "Old River Tale",
    "family": "Greens and Yellow-Greens",
    "color": "#c2c092"
  },
  {
    "code": "GG 7044",
    "name": "Inside a Pear",
    "family": "Greens and Yellow-Greens",
    "color": "#a2bcaa"
  },
  {
    "code": "GG 7091",
    "name": "Almost Autumn",
    "family": "Greens and Yellow-Greens",
    "color": "#a4c697"
  },
  {
    "code": "YG 8123",
    "name": "We Met on Twitter",
    "family": "Greens and Yellow-Greens",
    "color": "#a19b74"
  },
  {
    "code": "GG 7155",
    "name": "Everything Grew",
    "family": "Greens and Yellow-Greens",
    "color": "#91a181"
  },
  {
    "code": "GG 7172",
    "name": "Flower Paste",
    "family": "Greens and Yellow-Greens",
    "color": "#bace80"
  },
  {
    "code": "YG 8150",
    "name": "Too Chirpy for Me",
    "family": "Greens and Yellow-Greens",
    "color": "#c1ac69"
  },
  {
    "code": "GG 7061",
    "name": "Gabbar",
    "family": "Greens and Yellow-Greens",
    "color": "#5f7c6b"
  },
  {
    "code": "YG 8045",
    "name": "Dried Leaves",
    "family": "Greens and Yellow-Greens",
    "color": "#aeaf61"
  },
  {
    "code": "YG 8801",
    "name": "Sarson ke Phool",
    "family": "Greens and Yellow-Greens",
    "color": "#d1b12e"
  },
  {
    "code": "GG 7071",
    "name": "Crocodile Green",
    "family": "Greens and Yellow-Greens",
    "color": "#355744"
  },
  {
    "code": "YG 8803",
    "name": "Raw Mango",
    "family": "Greens and Yellow-Greens",
    "color": "#96a444"
  },
  {
    "code": "YG 8111",
    "name": "Freshly Pound",
    "family": "Greens and Yellow-Greens",
    "color": "#9f853c"
  },
  {
    "code": "NN 9105",
    "name": "An Old Fable",
    "family": "Popular Combinations",
    "color": "#e0ccb4"
  },
  {
    "code": "YR 2101",
    "name": "Warmth",
    "family": "Popular Combinations",
    "color": "#df985a"
  },
  {
    "code": "NN 9091",
    "name": "Somewhere a Babbler",
    "family": "Popular Combinations",
    "color": "#c6b7a2"
  },
  {
    "code": "RR 3801",
    "name": "Home for Holidays",
    "family": "Popular Combinations",
    "color": "#b44041"
  },
  {
    "code": "NN 9328",
    "name": "With Best Wishes",
    "family": "Popular Combinations",
    "color": "#dfdce0"
  },
  {
    "code": "NN 9355",
    "name": "Medley",
    "family": "Popular Combinations",
    "color": "#9f98a8"
  },
  {
    "code": "NN 9574",
    "name": "Inky Skies",
    "family": "Popular Combinations",
    "color": "#606467"
  },
  {
    "code": "YY 1044",
    "name": "Mimosa Blossom",
    "family": "Popular Combinations",
    "color": "#f7ce57"
  },
  {
    "code": "NN 9188",
    "name": "Freshly Baked Bread",
    "family": "Popular Combinations",
    "color": "#b9987e"
  },
  {
    "code": "YG 8061",
    "name": "Early Evening Lights",
    "family": "Popular Combinations",
    "color": "#c0c765"
  },
  {
    "code": "NN 9246",
    "name": "Emails can't Find You",
    "family": "Popular Combinations",
    "color": "#7f746c"
  },
  {
    "code": "BB 5179",
    "name": "Canoe in Palolem",
    "family": "Popular Combinations",
    "color": "#78bcd3"
  },
  {
    "code": "WW 0097",
    "name": "Tooth Fairy is Here",
    "family": "Popular Combinations",
    "color": "#f4f2e7"
  },
  {
    "code": "BB 5000",
    "name": "Into the Light",
    "family": "Popular Combinations",
    "color": "#c4c8e0"
  },
  {
    "code": "WW 0176",
    "name": "42 Watt Smiles",
    "family": "Popular Combinations",
    "color": "#dddcdb"
  },
  {
    "code": "BG 6800",
    "name": "Indian Ocean",
    "family": "Popular Combinations",
    "color": "#006778"
  },
  {
    "code": "YG 8017",
    "name": "Avo Smoothie",
    "family": "Popular Combinations",
    "color": "#d7dcc6"
  },
  {
    "code": "BG 6139",
    "name": "A Plunge in Nicobar",
    "family": "Popular Combinations",
    "color": "#77c0b2"
  },
  {
    "code": "YY 1114",
    "name": "Lemon Seeds",
    "family": "Popular Combinations",
    "color": "#ead6ac"
  },
  {
    "code": "YR 2802",
    "name": "Berries from Leh",
    "family": "Popular Combinations",
    "color": "#e9763e"
  },
  {
    "code": "NN 9425",
    "name": "Under the Willow Tree",
    "family": "Popular Combinations",
    "color": "#cdd5d0"
  },
  {
    "code": "RR 3091",
    "name": "Wes Anderson was Here",
    "family": "Popular Combinations",
    "color": "#e27f85"
  },
  {
    "code": "NN 9377",
    "name": "Vodka on Ice",
    "family": "Popular Combinations",
    "color": "#cdd1d8"
  },
  {
    "code": "NN 9301",
    "name": "Fur and Silk",
    "family": "Popular Combinations",
    "color": "#856f74"
  },
  {
    "code": "NN 9258",
    "name": "Ageing Gracefully",
    "family": "Popular Combinations",
    "color": "#cbb8b0"
  },
  {
    "code": "BB 5165",
    "name": "TGIF",
    "family": "Popular Combinations",
    "color": "#3b7799"
  },
  {
    "code": "NN 9192",
    "name": "She Talks in Proverbs",
    "family": "Popular Combinations",
    "color": "#e8dccf"
  },
  {
    "code": "PP 4801",
    "name": "Who Ordered the Romance?",
    "family": "Popular Combinations",
    "color": "#a65887"
  }
];

export const defaultPaintShades: PaintShade[] = card.map((shade) => ({ ...shade,
  id: 'opus-' + shade.code.toLowerCase().replace(/[^a-z0-9]/g, ''), brand: 'Birla Opus', enabled: true,
}));
