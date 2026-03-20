export type PositionKey = "KD" | "DEF" | "MID" | "FOR" | "KF" | "RUC";
export type Player = {
  name: string;
  club: string;
  number: number;
};
export type CoachPlayerPool = Record<PositionKey, Player[]>;
export const COACH_PLAYER_POOLS: Record<string, CoachPlayerPool> = {
  'Adrian Coach 1': {
    'KD': [
      {
        'name': "Samuel Collins",
        'club': "GCS",
        'number': 44
      },
      {
        'name': "Connor O'Sullivan",
        'club': "GEE",
        'number': 45
      },
      {
        'name': "Jack Henry",
        'club': "GEE",
        'number': 46
      },
      {
        'name': "Thomas Stewart",
        'club': "GEE",
        'number': 49
      },
      {
        'name': "Joshua Weddle",
        'club': "HAW",
        'number': 61
      }
    ],
    'DEF': [
      {
        'name': "Dayne Zorko",
        'club': "BRL",
        'number': 113
      },
      {
        'name': "Brayden Maynard",
        'club': "COL",
        'number': 128
      },
      {
        'name': "Isaac Quaynor",
        'club': "COL",
        'number': 131
      },
      {
        'name': "Andrew McGrath",
        'club': "ESS",
        'number': 136
      },
      {
        'name': "Judd McVee",
        'club': "FRE",
        'number': 150
      },
      {
        'name': "Lawson Humphries",
        'club': "GEE",
        'number': 162
      },
      {
        'name': "Karl Amon",
        'club': "HAW",
        'number': 180
      },
      {
        'name': "Changkuoth Jiath",
        'club': "MEL",
        'number': 186
      },
      {
        'name': "Kane Farrell",
        'club': "PTA",
        'number': 205
      },
      {
        'name': "Bailey Dale",
        'club': "WBU",
        'number': 235
      }
    ],
    'MID': [
      {
        'name': "Blake Acres",
        'club': "CAR",
        'number': 280
      },
      {
        'name': "Scott Pendlebury",
        'club': "COL",
        'number': 296
      },
      {
        'name': "Brayden Fiorini",
        'club': "ESS",
        'number': 299
      },
      {
        'name': "Darcy Parish",
        'club': "ESS",
        'number': 300
      },
      {
        'name': "Nathan O'Driscoll",
        'club': "FRE",
        'number': 317
      },
      {
        'name': "Sam Clohesy",
        'club': "GCS",
        'number': 329
      },
      {
        'name': "Tanner Bruhn",
        'club': "GEE",
        'number': 341
      },
      {
        'name': "Harry Sheezel",
        'club': "NTH",
        'number': 368
      },
      {
        'name': "Hugo Ralphsmith",
        'club': "RIC",
        'number': 385
      },
      {
        'name': "Hugh Boxshall",
        'club': "STK",
        'number': 394
      },
      {
        'name': "Errol Gulden",
        'club': "SYD",
        'number': 403
      },
      {
        'name': "Ed Richards",
        'club': "WBU",
        'number': 409
      }
    ],
    'FOR': [
      {
        'name': "Alex N-Bullen",
        'club': "ADE",
        'number': 422
      },
      {
        'name': "Izak Rankine",
        'club': "ADE",
        'number': 428
      },
      {
        'name': "Josh Rachele",
        'club': "ADE",
        'number': 430
      },
      {
        'name': "Lincoln McCarthy",
        'club': "BRL",
        'number': 439
      },
      {
        'name': "Jordan De Goey",
        'club': "COL",
        'number': 459
      },
      {
        'name': "Ben Long",
        'club': "GCS",
        'number': 485
      },
      {
        'name': "Gryan Miers",
        'club': "GEE",
        'number': 493
      },
      {
        'name': "Jake Stringer",
        'club': "GWS",
        'number': 506
      },
      {
        'name': "Paul Curtis",
        'club': "NTH",
        'number': 542
      },
      {
        'name': "Rhyan Mansell",
        'club': "RIC",
        'number': 559
      }
    ],
    'KF': [
      {
        'name': "Josh Treacy",
        'club': "FRE",
        'number': 646
      },
      {
        'name': "Ben King",
        'club': "GCS",
        'number': 651
      },
      {
        'name': "Jesse Hogan",
        'club': "GWS",
        'number': 662
      },
      {
        'name': "Cameron Zurhaar",
        'club': "NTH",
        'number': 678
      },
      {
        'name': "Jack Lukosius",
        'club': "PTA",
        'number': 685
      }
    ],
    'RUC': [
      {
        'name': "Reilly O'Brien",
        'club': "ADE",
        'number': 719
      },
      {
        'name': "Lloyd Meek",
        'club': "HAW",
        'number': 752
      },
      {
        'name': "Ned Reeves",
        'club': "HAW",
        'number': 754
      },
      {
        'name': "Bailey J. Williams",
        'club': "WCE",
        'number': 777
      }
    ]
  },
  'Chris Coach 2': {
    'KD': [
      {
        'name': "Luke Ryan",
        'club': "FRE",
        'number': 34
      },
      {
        'name': "Jy Farrar",
        'club': "GCS",
        'number': 41
      },
      {
        'name': "Connor Idun",
        'club': "GWS",
        'number': 50
      },
      {
        'name': "Jack Scrimshaw",
        'club': "HAW",
        'number': 57
      },
      {
        'name': "Ben Miller",
        'club': "RIC",
        'number': 77
      }
    ],
    'DEF': [
      {
        'name': "Keidean Coleman",
        'club': "BRL",
        'number': 115
      },
      {
        'name': "Noah Answerth",
        'club': "BRL",
        'number': 116
      },
      {
        'name': "Dan Houston",
        'club': "COL",
        'number': 129
      },
      {
        'name': "Mason Redman",
        'club': "ESS",
        'number': 142
      },
      {
        'name': "Max Kondogiannis",
        'club': "ESS",
        'number': 143
      },
      {
        'name': "Zak Johnson",
        'club': "ESS",
        'number': 144
      },
      {
        'name': "Jase Burgoyne",
        'club': "PTA",
        'number': 202
      },
      {
        'name': "Samuel Grlj",
        'club': "RIC",
        'number': 216
      },
      {
        'name': "Callum Mills",
        'club': "SYD",
        'number': 227
      },
      {
        'name': "Liam Baker",
        'club': "WCE",
        'number': 251
      }
    ],
    'MID': [
      {
        'name': "Jake Soligo",
        'club': "ADE",
        'number': 260
      },
      {
        'name': "Hugh McCluggage",
        'club': "BRL",
        'number': 267
      },
      {
        'name': "George Hewett",
        'club': "CAR",
        'number': 283
      },
      {
        'name': "Elijah Tsatas",
        'club': "ESS",
        'number': 302
      },
      {
        'name': "Matt Johnson",
        'club': "FRE",
        'number': 316
      },
      {
        'name': "Matt Rowell",
        'club': "GCS",
        'number': 327
      },
      {
        'name': "Noah Anderson",
        'club': "GCS",
        'number': 328
      },
      {
        'name': "George Wardlaw",
        'club': "NTH",
        'number': 367
      },
      {
        'name': "Zak Butters",
        'club': "PTA",
        'number': 383
      },
      {
        'name': "Dion Prestia",
        'club': "RIC",
        'number': 384
      },
      {
        'name': "Chad Warner",
        'club': "SYD",
        'number': 402
      },
      {
        'name': "Elijah Hewett",
        'club': "WCE",
        'number': 415
      },
      {
        'name': "Willem Duursma",
        'club': "WCE",
        'number': 421
      }
    ],
    'FOR': [
      {
        'name': "Callum Ah Chee",
        'club': "ADE",
        'number': 426
      },
      {
        'name': "James Peatling",
        'club': "ADE",
        'number': 429
      },
      {
        'name': "Lachlan Schultz",
        'club': "COL",
        'number': 461
      },
      {
        'name': "Bailey Humphrey",
        'club': "GCS",
        'number': 484
      },
      {
        'name': "Darcy Jones",
        'club': "GWS",
        'number': 504
      },
      {
        'name': "Josaia Delana",
        'club': "GWS",
        'number': 507
      },
      {
        'name': "Lachy Dovaston",
        'club': "NTH",
        'number': 541
      },
      {
        'name': "Jake Lloyd",
        'club': "SYD",
        'number': 583
      },
      {
        'name': "Tom Papley",
        'club': "SYD",
        'number': 590
      },
      {
        'name': "Sam Davidson",
        'club': "WBU",
        'number': 602
      }
    ],
    'KF': [
      {
        'name': "Cooper Trembath",
        'club': "NTH",
        'number': 679
      },
      {
        'name': "Anthony Caminiti",
        'club': "STK",
        'number': 697
      },
      {
        'name': "Jack Silvagni",
        'club': "STK",
        'number': 700
      },
      {
        'name': "Mitchito Owens",
        'club': "STK",
        'number': 702
      },
      {
        'name': "Sam Darcy",
        'club': "WBU",
        'number': 713
      }
    ],
    'RUC': [
      {
        'name': "Darcy Fort",
        'club': "BRL",
        'number': 720
      },
      {
        'name': "Jarrod Witts",
        'club': "GCS",
        'number': 738
      },
      {
        'name': "Tristan Xerri",
        'club': "NTH",
        'number': 761
      }
    ]
  },
  'Damian Coach 3': {
    'KD': [
      {
        'name': "Ryan Lester",
        'club': "BRL",
        'number': 10
      },
      {
        'name': "Jayden Laverde",
        'club': "GWS",
        'number': 53
      },
      {
        'name': "James Sicily",
        'club': "HAW",
        'number': 59
      },
      {
        'name': "Aliir Aliir",
        'club': "PTA",
        'number': 73
      },
      {
        'name': "Alix Tauru",
        'club': "STK",
        'number': 81
      },
      {
        'name': "Tom McCartin",
        'club': "SYD",
        'number': 91
      }
    ],
    'DEF': [
      {
        'name': "Jaspa Fletcher",
        'club': "BRL",
        'number': 114
      },
      {
        'name': "Nic Newman",
        'club': "CAR",
        'number': 124
      },
      {
        'name': "Nick Haynes",
        'club': "CAR",
        'number': 125
      },
      {
        'name': "Karl Worner",
        'club': "FRE",
        'number': 151
      },
      {
        'name': "Joseph Fonti",
        'club': "GWS",
        'number': 171
      },
      {
        'name': "Jake Bowey",
        'club': "MEL",
        'number': 188
      },
      {
        'name': "Miles Bergman",
        'club': "PTA",
        'number': 208
      },
      {
        'name': "Sam Banks",
        'club': "RIC",
        'number': 215
      },
      {
        'name': "Jack Sinclair",
        'club': "STK",
        'number': 220
      }
    ],
    'MID': [
      {
        'name': "Levi Ashcroft",
        'club': "BRL",
        'number': 273
      },
      {
        'name': "Adam Cerra",
        'club': "CAR",
        'number': 278
      },
      {
        'name': "Cooper Lord",
        'club': "CAR",
        'number': 282
      },
      {
        'name': "Nick Daicos",
        'club': "COL",
        'number': 293
      },
      {
        'name': "Will Setterfield",
        'club': "ESS",
        'number': 307
      },
      {
        'name': "Jhye Clark",
        'club': "GEE",
        'number': 337
      },
      {
        'name': "Max Holmes",
        'club': "GEE",
        'number': 338
      },
      {
        'name': "Stephen Coniglio",
        'club': "GWS",
        'number': 349
      },
      {
        'name': "Jack Steele",
        'club': "MEL",
        'number': 360
      },
      {
        'name': "Tim Taranto",
        'club': "RIC",
        'number': 393
      },
      {
        'name': "Adam Treloar",
        'club': "WBU",
        'number': 408
      },
      {
        'name': "Elliot Yeo",
        'club': "WCE",
        'number': 416
      }
    ],
    'FOR': [
      {
        'name': "Cameron Rayner",
        'club': "BRL",
        'number': 435
      },
      {
        'name': "Kai Lohmann",
        'club': "BRL",
        'number': 438
      },
      {
        'name': "Zac Bailey",
        'club': "BRL",
        'number': 442
      },
      {
        'name': "Shai Bolton",
        'club': "FRE",
        'number': 482
      },
      {
        'name': "Jack Martin",
        'club': "GEE",
        'number': 494
      },
      {
        'name': "Brent Daniels",
        'club': "GWS",
        'number': 501
      },
      {
        'name': "Connor Macdonald",
        'club': "HAW",
        'number': 515
      },
      {
        'name': "Dylan Moore",
        'club': "HAW",
        'number': 516
      },
      {
        'name': "Sam Flanders",
        'club': "STK",
        'number': 579
      }
    ],
    'KF': [
      {
        'name': "Nate Caddy",
        'club': "ESS",
        'number': 642
      },
      {
        'name': "Jamarra Ugle-Hagan",
        'club': "GCS",
        'number': 654
      },
      {
        'name': "Shannon Neale",
        'club': "GEE",
        'number': 659
      },
      {
        'name': "Jake Melksham",
        'club': "MEL",
        'number': 674
      },
      {
        'name': "Charlie Curnow",
        'club': "SYD",
        'number': 703
      },
      {
        'name': "Jake Waterman",
        'club': "WCE",
        'number': 716
      }
    ],
    'RUC': [
      {
        'name': "Lachlan McAndrew",
        'club': "ADE",
        'number': 718
      },
      {
        'name': "Sam Draper",
        'club': "BRL",
        'number': 722
      },
      {
        'name': "Darcy Cameron",
        'club': "COL",
        'number': 727
      },
      {
        'name': "Kieren Briggs",
        'club': "GWS",
        'number': 747
      }
    ]
  },
  'Dane Coach 4': {
    'KD': [
      {
        'name': "Jacob Weitering",
        'club': "CAR",
        'number': 16
      },
      {
        'name': "Charlie Ballard",
        'club': "GCS",
        'number': 39
      },
      {
        'name': "Mac Andrew",
        'club': "GCS",
        'number': 42
      },
      {
        'name': "Jack Buckley",
        'club': "GWS",
        'number': 52
      },
      {
        'name': "Sam Taylor",
        'club': "GWS",
        'number': 55
      },
      {
        'name': "Tylar Young",
        'club': "WCE",
        'number': 103
      }
    ],
    'DEF': [
      {
        'name': "Daniel Rioli",
        'club': "GCS",
        'number': 153
      },
      {
        'name': "Jarman Impey",
        'club': "HAW",
        'number': 179
      },
      {
        'name': "Connor Rozee",
        'club': "PTA",
        'number': 200
      },
      {
        'name': "Nasiah W-Milera",
        'club': "STK",
        'number': 225
      },
      {
        'name': "Dane Rampe",
        'club': "SYD",
        'number': 228
      },
      {
        'name': "Nick Blakey",
        'club': "SYD",
        'number': 232
      },
      {
        'name': "Brandon Starcevich",
        'club': "WCE",
        'number': 248
      },
      {
        'name': "Reuben Ginbey",
        'club': "WCE",
        'number': 254
      },
      {
        'name': "Tom McCarthy",
        'club': "WCE",
        'number': 256
      }
    ],
    'MID': [
      {
        'name': "Jarrod Berry",
        'club': "BRL",
        'number': 269
      },
      {
        'name': "Lachie Neale",
        'club': "BRL",
        'number': 272
      },
      {
        'name': "Campbell Chesser",
        'club': "CAR",
        'number': 281
      },
      {
        'name': "Sam Walsh",
        'club': "CAR",
        'number': 289
      },
      {
        'name': "Jeremy Sharp",
        'club': "FRE",
        'number': 315
      },
      {
        'name': "Alex Davies",
        'club': "GCS",
        'number': 320
      },
      {
        'name': "Tom Atkins",
        'club': "GEE",
        'number': 342
      },
      {
        'name': "Finn Callaghan",
        'club': "GWS",
        'number': 344
      },
      {
        'name': "Massimo D'Ambrosio",
        'club': "HAW",
        'number': 357
      },
      {
        'name': "Willem Drew",
        'club': "PTA",
        'number': 382
      },
      {
        'name': "Hugo Garcia",
        'club': "STK",
        'number': 395
      },
      {
        'name': "Marcus Windhager",
        'club': "STK",
        'number': 398
      }
    ],
    'FOR': [
      {
        'name': "Charlie Cameron",
        'club': "BRL",
        'number': 436
      },
      {
        'name': "Will Hayward",
        'club': "CAR",
        'number': 451
      },
      {
        'name': "Patrick Lipinski",
        'club': "COL",
        'number': 463
      },
      {
        'name': "Joel Jeffrey",
        'club': "GCS",
        'number': 487
      },
      {
        'name': "Ollie Dempsey",
        'club': "GEE",
        'number': 497
      },
      {
        'name': "Kysaiah Pickett",
        'club': "MEL",
        'number': 530
      },
      {
        'name': "Bradley Hill",
        'club': "STK",
        'number': 566
      },
      {
        'name': "Darcy Wilson",
        'club': "STK",
        'number': 569
      },
      {
        'name': "Ryan Maric",
        'club': "WCE",
        'number': 611
      }
    ],
    'KF': [
      {
        'name': "Darcy Fogarty",
        'club': "ADE",
        'number': 618
      },
      {
        'name': "Riley Thilthorpe",
        'club': "ADE",
        'number': 621
      },
      {
        'name': "Logan Morris",
        'club': "BRL",
        'number': 627
      },
      {
        'name': "Mitchell Lewis",
        'club': "HAW",
        'number': 667
      },
      {
        'name': "Nick Larkey",
        'club': "NTH",
        'number': 682
      },
      {
        'name': "Mitch Georgiades",
        'club': "PTA",
        'number': 687
      }
    ],
    'RUC': [
      {
        'name': "Nick Bryan",
        'club': "ESS",
        'number': 732
      },
      {
        'name': "Mark Blicavs",
        'club': "GEE",
        'number': 743
      },
      {
        'name': "Tom De Koning",
        'club': "STK",
        'number': 770
      },
      {
        'name': "Matthew Flynn",
        'club': "WCE",
        'number': 780
      }
    ]
  },
  'Josh Coach 5': {
    'KD': [
      {
        'name': "Lachlan Blakiston",
        'club': "ESS",
        'number': 26
      },
      {
        'name': "Sam De Koning",
        'club': "GEE",
        'number': 48
      },
      {
        'name': "Josh Battle",
        'club': "HAW",
        'number': 60
      },
      {
        'name': "Campbell Gray",
        'club': "RIC",
        'number': 78
      },
      {
        'name': "Callum Wilkie",
        'club': "STK",
        'number': 82
      },
      {
        'name': "Tobie Travaglia",
        'club': "STK",
        'number': 85
      }
    ],
    'DEF': [
      {
        'name': "Mitchell Hinge",
        'club': "ADE",
        'number': 107
      },
      {
        'name': "Lachlan Cowan",
        'club': "CAR",
        'number': 122
      },
      {
        'name': "Josh Daicos",
        'club': "COL",
        'number': 133
      },
      {
        'name': "Lachlan Ash",
        'club': "GWS",
        'number': 173
      },
      {
        'name': "Blake Hardwick",
        'club': "HAW",
        'number': 176
      },
      {
        'name': "Caleb Daniel",
        'club': "NTH",
        'number': 193
      },
      {
        'name': "Colby McKercher",
        'club': "NTH",
        'number': 194
      },
      {
        'name': "Nick Vlastuin",
        'club': "RIC",
        'number': 214
      },
      {
        'name': "Brady Hough",
        'club': "WCE",
        'number': 247
      }
    ],
    'MID': [
      {
        'name': "Edward Allan",
        'club': "COL",
        'number': 291
      },
      {
        'name': "Neil Erasmus",
        'club': "FRE",
        'number': 318
      },
      {
        'name': "James Worpel",
        'club': "GEE",
        'number': 336
      },
      {
        'name': "Clayton Oliver",
        'club': "GWS",
        'number': 343
      },
      {
        'name': "Joshua Kelly",
        'club': "GWS",
        'number': 347
      },
      {
        'name': "Cameron Mackenzie",
        'club': "HAW",
        'number': 353
      },
      {
        'name': "Jai Newcombe",
        'club': "HAW",
        'number': 356
      },
      {
        'name': "Harvey Langford",
        'club': "MEL",
        'number': 359
      },
      {
        'name': "Luke D-Uniacke",
        'club': "NTH",
        'number': 369
      },
      {
        'name': "Tom Powell",
        'club': "NTH",
        'number': 372
      },
      {
        'name': "Marcus Bontempelli",
        'club': "WBU",
        'number': 411
      },
      {
        'name': "Harley Reid",
        'club': "WCE",
        'number': 418
      }
    ],
    'FOR': [
      {
        'name': "Ben Ainsworth",
        'club': "CAR",
        'number': 444
      },
      {
        'name': "Jack Crisp",
        'club': "COL",
        'number': 456
      },
      {
        'name': "Ned Long",
        'club': "COL",
        'number': 462
      },
      {
        'name': "Shaun Mannagh",
        'club': "GEE",
        'number': 499
      },
      {
        'name': "Jack Ginnivan",
        'club': "HAW",
        'number': 519
      },
      {
        'name': "Josh Ward",
        'club': "HAW",
        'number': 520
      },
      {
        'name': "Tom Sparrow",
        'club': "MEL",
        'number': 534
      },
      {
        'name': "Sam Lalor",
        'club': "RIC",
        'number': 560
      },
      {
        'name': "Mattaes Phillipou",
        'club': "STK",
        'number': 576
      }
    ],
    'KF': [
      {
        'name': "Aaron Cadman",
        'club': "GWS",
        'number': 660
      },
      {
        'name': "Jake Riccardi",
        'club': "GWS",
        'number': 661
      },
      {
        'name': "Todd Marshall",
        'club': "PTA",
        'number': 689
      },
      {
        'name': "Joel Amartey",
        'club': "SYD",
        'number': 705
      },
      {
        'name': "Aaron Naughton",
        'club': "WBU",
        'number': 711
      },
      {
        'name': "Jobe Shanahan",
        'club': "WCE",
        'number': 717
      }
    ],
    'RUC': [
      {
        'name': "Luke Jackson",
        'club': "FRE",
        'number': 735
      },
      {
        'name': "Sean Darcy",
        'club': "FRE",
        'number': 736
      },
      {
        'name': "Dante Visentini",
        'club': "PTA",
        'number': 762
      },
      {
        'name': "Jordon Sweet",
        'club': "PTA",
        'number': 764
      }
    ]
  },
  'Mark Coach 6': {
    'KD': [
      {
        'name': "Max Michalanney",
        'club': "ADE",
        'number': 5
      },
      {
        'name': "Jordan Ridley",
        'club': "ESS",
        'number': 25
      },
      {
        'name': "Harrison Himmelberg",
        'club': "GWS",
        'number': 51
      },
      {
        'name': "Noah Balta",
        'club': "RIC",
        'number': 80
      },
      {
        'name': "Rory Lobb",
        'club': "WBU",
        'number': 96
      }
    ],
    'DEF': [
      {
        'name': "Darcy Wilmot",
        'club': "BRL",
        'number': 112
      },
      {
        'name': "Jordan Clark",
        'club': "FRE",
        'number': 149
      },
      {
        'name': "John Noble",
        'club': "GCS",
        'number': 155
      },
      {
        'name': "Wil Powell",
        'club': "GCS",
        'number': 156
      },
      {
        'name': "Conor Stone",
        'club': "GWS",
        'number': 167
      },
      {
        'name': "Jacob Wehr",
        'club': "PTA",
        'number': 201
      },
      {
        'name': "Jayden Short",
        'club': "RIC",
        'number': 209
      },
      {
        'name': "Lachie Jaques",
        'club': "WBU",
        'number': 239
      },
      {
        'name': "Lachlan Bramble",
        'club': "WBU",
        'number': 240
      }
    ],
    'MID': [
      {
        'name': "Oliver Florent",
        'club': "CAR",
        'number': 287
      },
      {
        'name': "Steele Sidebottom",
        'club': "COL",
        'number': 297
      },
      {
        'name': "Caleb Serong",
        'club': "FRE",
        'number': 311
      },
      {
        'name': "Hayden Young",
        'club': "FRE",
        'number': 313
      },
      {
        'name': "Christian Petracca",
        'club': "GCS",
        'number': 323
      },
      {
        'name': "Bailey Smith",
        'club': "GEE",
        'number': 331
      },
      {
        'name': "Conor Nash",
        'club': "HAW",
        'number': 354
      },
      {
        'name': "Will Day",
        'club': "HAW",
        'number': 358
      },
      {
        'name': "Jai Culley",
        'club': "MEL",
        'number': 362
      },
      {
        'name': "Luke Parker",
        'club': "NTH",
        'number': 370
      },
      {
        'name': "Jacob Hopper",
        'club': "RIC",
        'number': 386
      },
      {
        'name': "Isaac Heeney",
        'club': "SYD",
        'number': 404
      }
    ],
    'FOR': [
      {
        'name': "Francis Evans",
        'club': "CAR",
        'number': 446
      },
      {
        'name': "Zachary Williams",
        'club': "CAR",
        'number': 452
      },
      {
        'name': "Archie Perkins",
        'club': "ESS",
        'number': 466
      },
      {
        'name': "Murphy Reid",
        'club': "FRE",
        'number': 478
      },
      {
        'name': "Nick Watson",
        'club': "HAW",
        'number': 521
      },
      {
        'name': "Ed Langdon",
        'club': "MEL",
        'number': 525
      },
      {
        'name': "Mason Wood",
        'club': "STK",
        'number': 575
      },
      {
        'name': "Justin McInerney",
        'club': "SYD",
        'number': 585
      },
      {
        'name': "Connor Budarick",
        'club': "WBU",
        'number': 593
      },
      {
        'name': "Ryley Sanders",
        'club': "WBU",
        'number': 601
      },
      {
        'name': "Deven Robertson",
        'club': "WCE",
        'number': 603
      }
    ],
    'KF': [
      {
        'name': "Oscar Allen",
        'club': "BRL",
        'number': 629
      },
      {
        'name': "Peter Wright",
        'club': "ESS",
        'number': 643
      },
      {
        'name': "Mason Cox",
        'club': "FRE",
        'number': 648
      },
      {
        'name': "Bayley Fritsch",
        'club': "MEL",
        'number': 669
      },
      {
        'name': "Daniel Turner",
        'club': "MEL",
        'number': 671
      },
      {
        'name': "Logan McDonald",
        'club': "SYD",
        'number': 707
      }
    ],
    'RUC': [
      {
        'name': "Marc Pittonet",
        'club': "CAR",
        'number': 725
      },
      {
        'name': "Nick Madden",
        'club': "GWS",
        'number': 749
      },
      {
        'name': "Brodie Grundy",
        'club': "SYD",
        'number': 771
      }
    ]
  },
  'Rick Coach 7': {
    'KD': [
      {
        'name': "Mitch McGovern",
        'club': "CAR",
        'number': 19
      },
      {
        'name': "Zach Reid",
        'club': "ESS",
        'number': 28
      },
      {
        'name': "Tom McDonald",
        'club': "MEL",
        'number': 68
      },
      {
        'name': "Brandon Z-Thatcher",
        'club': "PTA",
        'number': 74
      },
      {
        'name': "Jai Serong",
        'club': "SYD",
        'number': 86
      },
      {
        'name': "James O'Donnell",
        'club': "WBU",
        'number': 94
      }
    ],
    'DEF': [
      {
        'name': "Daniel Curtin",
        'club': "ADE",
        'number': 105
      },
      {
        'name': "Adam Saad",
        'club': "CAR",
        'number': 118
      },
      {
        'name': "Oliver Hollands",
        'club': "CAR",
        'number': 126
      },
      {
        'name': "Archie Roberts",
        'club': "ESS",
        'number': 138
      },
      {
        'name': "Jaxon Prior",
        'club': "ESS",
        'number': 140
      },
      {
        'name': "Zach Guthrie",
        'club': "GEE",
        'number': 166
      },
      {
        'name': "Lachie Whitfield",
        'club': "GWS",
        'number': 172
      },
      {
        'name': "Christian Salem",
        'club': "MEL",
        'number': 187
      },
      {
        'name': "Matthew Roberts",
        'club': "SYD",
        'number': 231
      },
      {
        'name': "Bailey Williams",
        'club': "WBU",
        'number': 236
      },
      {
        'name': "Tom Cole",
        'club': "WCE",
        'number': 255
      }
    ],
    'MID': [
      {
        'name': "Will Ashcroft",
        'club': "BRL",
        'number': 277
      },
      {
        'name': "Jagga Smith",
        'club': "CAR",
        'number': 285
      },
      {
        'name': "Dyson Sharp",
        'club': "ESS",
        'number': 301
      },
      {
        'name': "Jye Caldwell",
        'club': "ESS",
        'number': 303
      },
      {
        'name': "Saad E-Hawli",
        'club': "ESS",
        'number': 305
      },
      {
        'name': "Andrew Brayshaw",
        'club': "FRE",
        'number': 310
      },
      {
        'name': "Touk Miller",
        'club': "GCS",
        'number': 330
      },
      {
        'name': "Harry Rowston",
        'club': "GWS",
        'number': 345
      },
      {
        'name': "Kane McAuliffe",
        'club': "RIC",
        'number': 389
      },
      {
        'name': "James Rowbottom",
        'club': "SYD",
        'number': 406
      },
      {
        'name': "Matthew Kennedy",
        'club': "WBU",
        'number': 412
      }
    ],
    'FOR': [
      {
        'name': "Ben Keays",
        'club': "ADE",
        'number': 423
      },
      {
        'name': "Matt Cottrell",
        'club': "CAR",
        'number': 449
      },
      {
        'name': "Jamie Elliott",
        'club': "COL",
        'number': 458
      },
      {
        'name': "Harry Morrison",
        'club': "HAW",
        'number': 518
      },
      {
        'name': "Kade Chandler",
        'club': "MEL",
        'number': 528
      },
      {
        'name': "Jy Simpkin",
        'club': "NTH",
        'number': 540
      },
      {
        'name': "Joe Richards",
        'club': "PTA",
        'number': 552
      },
      {
        'name': "Jack Ross",
        'club': "RIC",
        'number': 556
      },
      {
        'name': "Jackson Macrae",
        'club': "STK",
        'number': 571
      },
      {
        'name': "Jack Graham",
        'club': "WCE",
        'number': 606
      }
    ],
    'KF': [
      {
        'name': "Tim Membrey",
        'club': "COL",
        'number': 637
      },
      {
        'name': "Patrick Voss",
        'club': "FRE",
        'number': 649
      },
      {
        'name': "Jack Gunston",
        'club': "HAW",
        'number': 665
      },
      {
        'name': "Mabior Chol",
        'club': "HAW",
        'number': 666
      },
      {
        'name': "Cooper Sharman",
        'club': "STK",
        'number': 698
      }
    ],
    'RUC': [
      {
        'name': "Rhys Stanley",
        'club': "GEE",
        'number': 745
      },
      {
        'name': "Rowan Marshall",
        'club': "STK",
        'number': 769
      },
      {
        'name': "Timothy English",
        'club': "WBU",
        'number': 775
      }
    ]
  },
  'Troy Coach 8': {
    'KD': [
      {
        'name': "Josh Worrell",
        'club': "ADE",
        'number': 3
      },
      {
        'name': "Harris Andrews",
        'club': "BRL",
        'number': 8
      },
      {
        'name': "Jeremy Howe",
        'club': "COL",
        'number': 22
      },
      {
        'name': "Heath Chapman",
        'club': "FRE",
        'number': 31
      },
      {
        'name': "Bodhi Uwland",
        'club': "GCS",
        'number': 37
      },
      {
        'name': "Jake Lever",
        'club': "MEL",
        'number': 65
      }
    ],
    'DEF': [
      {
        'name': "Rory Laird",
        'club': "ADE",
        'number': 109
      },
      {
        'name': "Wayne Milera",
        'club': "ADE",
        'number': 110
      },
      {
        'name': "Harry Perryman",
        'club': "COL",
        'number': 130
      },
      {
        'name': "Caleb Windsor",
        'club': "MEL",
        'number': 185
      },
      {
        'name': "Trent Rivers",
        'club': "MEL",
        'number': 191
      },
      {
        'name': "Finn O'Sullivan",
        'club': "NTH",
        'number': 195
      },
      {
        'name': "Riley Bice",
        'club': "SYD",
        'number': 233
      },
      {
        'name': "Joel Freijah",
        'club': "WBU",
        'number': 238
      },
      {
        'name': "Liam Duggan",
        'club': "WCE",
        'number': 252
      }
    ],
    'MID': [
      {
        'name': "Jordan Dawson",
        'club': "ADE",
        'number': 261
      },
      {
        'name': "Josh Dunkley",
        'club': "BRL",
        'number': 270
      },
      {
        'name': "Patrick Cripps",
        'club': "CAR",
        'number': 288
      },
      {
        'name': "Sam Durham",
        'club': "ESS",
        'number': 306
      },
      {
        'name': "Zachary Merrett",
        'club': "ESS",
        'number': 308
      },
      {
        'name': "Jaeger O'Meara",
        'club': "FRE",
        'number': 314
      },
      {
        'name': "Jack Viney",
        'club': "MEL",
        'number': 361
      },
      {
        'name': "Xavier Lindsay",
        'club': "MEL",
        'number': 364
      },
      {
        'name': "Oliver Wines",
        'club': "PTA",
        'number': 379
      },
      {
        'name': "Angus Sheldrick",
        'club': "SYD",
        'number': 400
      },
      {
        'name': "James Jordon",
        'club': "SYD",
        'number': 405
      },
      {
        'name': "Thomas Liberatore",
        'club': "WBU",
        'number': 413
      }
    ],
    'FOR': [
      {
        'name': "Beau McCreery",
        'club': "COL",
        'number': 453
      },
      {
        'name': "Xavier Duursma",
        'club': "ESS",
        'number': 474
      },
      {
        'name': "Patrick Dangerfield",
        'club': "GEE",
        'number': 498
      },
      {
        'name': "Harvey Thomas",
        'club': "GWS",
        'number': 505
      },
      {
        'name': "Toby Greene",
        'club': "GWS",
        'number': 513
      },
      {
        'name': "Jason H-Francis",
        'club': "PTA",
        'number': 550
      },
      {
        'name': "Max Hall",
        'club': "STK",
        'number': 577
      },
      {
        'name': "Rhylee West",
        'club': "WBU",
        'number': 599
      },
      {
        'name': "Tim Kelly",
        'club': "WCE",
        'number': 613
      }
    ],
    'KF': [
      {
        'name': "Taylor Walker",
        'club': "ADE",
        'number': 622
      },
      {
        'name': "Harry McKay",
        'club': "CAR",
        'number': 631
      },
      {
        'name': "Kyle Langford",
        'club': "ESS",
        'number': 640
      },
      {
        'name': "Jeremy Cameron",
        'club': "GEE",
        'number': 657
      },
      {
        'name': "Brody Mihocek",
        'club': "MEL",
        'number': 670
      },
      {
        'name': "Jacob van Rooyen",
        'club': "MEL",
        'number': 673
      }
    ],
    'RUC': [
      {
        'name': "Ethan Read",
        'club': "GCS",
        'number': 737
      },
      {
        'name': "Max Gawn",
        'club': "MEL",
        'number': 756
      },
      {
        'name': "Charlie Comben",
        'club': "NTH",
        'number': 759
      },
      {
        'name': "Toby Nankervis",
        'club': "RIC",
        'number': 767
      }
    ]
  }
};

export const COACH_PLAYER_POOL_ALIASES: Record<string, string[]> = {
  'Adrian Coach 1': [
    "Adrian Coach 1",
    "Adrian",
    "Coach 1",
    "1",
    "Adrian Coach 1"
  ],
  'Chris Coach 2': [
    "Chris Coach 2",
    "Chris",
    "Coach 2",
    "2",
    "Chris Coach 2"
  ],
  'Damian Coach 3': [
    "Damian Coach 3",
    "Damian",
    "Coach 3",
    "3",
    "Damian Coach 3"
  ],
  'Dane Coach 4': [
    "Dane Coach 4",
    "Dane",
    "Coach 4",
    "4",
    "Dane Coach 4"
  ],
  'Josh Coach 5': [
    "Josh Coach 5",
    "Josh",
    "Coach 5",
    "5",
    "Josh Coach 5"
  ],
  'Mark Coach 6': [
    "Mark Coach 6",
    "Mark",
    "Coach 6",
    "6",
    "Mark Coach 6"
  ],
  'Rick Coach 7': [
    "Rick Coach 7",
    "Rick",
    "Coach 7",
    "7",
    "Rick Coach 7"
  ],
  'Troy Coach 8': [
    "Troy Coach 8",
    "Troy",
    "Coach 8",
    "8",
    "Troy Coach 8"
  ]
};


const EMPTY_POOL: CoachPlayerPool = {
  KD: [],
  DEF: [],
  MID: [],
  FOR: [],
  KF: [],
  RUC: [],
};

function normalizeValue(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function getPlayersForCoach(params: {
  coachId?: number | null;
  coachName?: string | null;
}): CoachPlayerPool {
  const coachName = params.coachName?.trim() ?? "";
  const coachId = params.coachId != null ? String(params.coachId) : "";

  const directNameMatch = COACH_PLAYER_POOLS[coachName];
  if (directNameMatch) {
    return directNameMatch;
  }

  const normalizedName = normalizeValue(coachName);

  for (const [sheetName, names] of Object.entries(COACH_PLAYER_POOL_ALIASES)) {
    const hasAliasMatch = names.some((alias) => normalizeValue(alias) === normalizedName);
    if (hasAliasMatch) {
      return COACH_PLAYER_POOLS[sheetName];
    }
  }

  for (const [sheetName, names] of Object.entries(COACH_PLAYER_POOL_ALIASES)) {
    const hasPartialNameMatch =
      normalizedName.length > 0 &&
      names.some((alias) => {
        const normalizedAlias = normalizeValue(alias);
        return (
          normalizedAlias.includes(normalizedName) ||
          normalizedName.includes(normalizedAlias)
        );
      });

    const hasCoachIdMatch =
      coachId.length > 0 &&
      names.some((alias) => normalizeValue(alias) === coachId);

    if (hasPartialNameMatch || hasCoachIdMatch) {
      return COACH_PLAYER_POOLS[sheetName];
    }
  }

  return EMPTY_POOL;
}
