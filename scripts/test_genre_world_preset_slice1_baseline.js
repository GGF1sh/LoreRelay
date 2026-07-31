module.exports = {
  "dungeon-crawler": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "Dungeon Crawler — genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "dungeon-crawler",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "deep_halls_1",
          "name": "Deep Halls",
          "type": "dungeon",
          "biome": "underground",
          "x": 502,
          "y": 240,
          "dangerLevel": 4,
          "connectedTo": [
            "sunken_chamber_2",
            "upper_passage_5"
          ],
          "imagePromptHint": "A landscape view of Deep Halls, dungeon environment, dungeon-crawler artstyle"
        },
        {
          "id": "sunken_chamber_2",
          "name": "Sunken Chamber",
          "type": "ruins",
          "biome": "ruins",
          "x": 782,
          "y": 394,
          "dangerLevel": 2,
          "connectedTo": [
            "deep_halls_1",
            "forsaken_warren_3"
          ],
          "imagePromptHint": "A landscape view of Sunken Chamber, ruins environment, dungeon-crawler artstyle"
        },
        {
          "id": "forsaken_warren_3",
          "name": "Forsaken Warren",
          "type": "dungeon",
          "biome": "underground",
          "x": 648,
          "y": 728,
          "dangerLevel": 5,
          "connectedTo": [
            "sunken_chamber_2",
            "crumbled_depths_4",
            "upper_passage_5"
          ],
          "imagePromptHint": "A landscape view of Forsaken Warren, dungeon environment, dungeon-crawler artstyle"
        },
        {
          "id": "crumbled_depths_4",
          "name": "Crumbled Depths",
          "type": "other",
          "biome": "other",
          "x": 313,
          "y": 726,
          "dangerLevel": 3,
          "connectedTo": [
            "forsaken_warren_3",
            "upper_passage_5"
          ],
          "imagePromptHint": "A landscape view of Crumbled Depths, other environment, dungeon-crawler artstyle"
        },
        {
          "id": "upper_passage_5",
          "name": "Upper Passage",
          "type": "dungeon",
          "biome": "underground",
          "x": 203,
          "y": 420,
          "dangerLevel": 9,
          "connectedTo": [
            "crumbled_depths_4",
            "deep_halls_1",
            "forsaken_warren_3"
          ],
          "imagePromptHint": "A landscape view of Upper Passage, dungeon environment, dungeon-crawler artstyle",
          "hazard": "haunted"
        }
      ],
      "locations": [
        {
          "id": "deep_den_1",
          "name": "Deep Den",
          "type": "dungeon",
          "regionId": "deep_halls_1",
          "imagePromptHint": "A view of Deep Den, dungeon structure, in Deep Halls, dungeon environment"
        },
        {
          "id": "deep_wreckage_2",
          "name": "Deep Wreckage",
          "type": "ruins",
          "regionId": "deep_halls_1",
          "imagePromptHint": "A view of Deep Wreckage, ruins structure, in Deep Halls, dungeon environment"
        },
        {
          "id": "sunken_shell_3",
          "name": "Sunken Shell",
          "type": "ruins",
          "regionId": "sunken_chamber_2",
          "imagePromptHint": "A view of Sunken Shell, ruins structure, in Sunken Chamber, ruins environment"
        },
        {
          "id": "sunken_sanctum_4",
          "name": "Sunken Sanctum",
          "type": "dungeon",
          "regionId": "sunken_chamber_2",
          "imagePromptHint": "A view of Sunken Sanctum, dungeon structure, in Sunken Chamber, ruins environment"
        },
        {
          "id": "sunken_trail_5",
          "name": "Sunken Trail",
          "type": "wilderness",
          "regionId": "sunken_chamber_2",
          "imagePromptHint": "A view of Sunken Trail, wilderness structure, in Sunken Chamber, ruins environment"
        },
        {
          "id": "forsaken_sanctum_6",
          "name": "Forsaken Sanctum",
          "type": "dungeon",
          "regionId": "forsaken_warren_3",
          "imagePromptHint": "A view of Forsaken Sanctum, dungeon structure, in Forsaken Warren, dungeon environment"
        },
        {
          "id": "crumbled_corner_7",
          "name": "Crumbled Corner",
          "type": "other",
          "regionId": "crumbled_depths_4",
          "imagePromptHint": "A view of Crumbled Corner, other structure, in Crumbled Depths, other environment"
        },
        {
          "id": "crumbled_place_8",
          "name": "Crumbled Place",
          "type": "other",
          "regionId": "crumbled_depths_4",
          "imagePromptHint": "A view of Crumbled Place, other structure, in Crumbled Depths, other environment"
        },
        {
          "id": "crumbled_point_9",
          "name": "Crumbled Point",
          "type": "other",
          "regionId": "crumbled_depths_4",
          "imagePromptHint": "A view of Crumbled Point, other structure, in Crumbled Depths, other environment"
        },
        {
          "id": "upper_shrine_10",
          "name": "Upper Shrine",
          "type": "landmark",
          "regionId": "upper_passage_5",
          "imagePromptHint": "A view of Upper Shrine, landmark structure, in Upper Passage, dungeon environment",
          "factionControl": "bone_conclave_3"
        }
      ]
    },
    "factions": [
      {
        "id": "grave_order_1",
        "name": "Grave Order",
        "type": "friendly",
        "power": 32,
        "resources": {
          "food": 18,
          "weapons": 26,
          "mana": 21
        },
        "enemies": [
          "undead_legion_2"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "undead_legion_2",
        "name": "Undead Legion",
        "type": "neutral",
        "power": 60,
        "resources": {
          "food": 29,
          "weapons": 16,
          "mana": 8
        },
        "enemies": [
          "grave_order_1"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "bone_conclave_3",
        "name": "Bone Conclave",
        "type": "friendly",
        "power": 74,
        "resources": {
          "food": 38,
          "weapons": 16,
          "mana": 36
        },
        "enemies": [],
        "allies": [],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "Ancient",
        "yearsBefore": 800,
        "event": "A great empire carved these halls as a seat of power."
      },
      {
        "era": "Collapse",
        "yearsBefore": 300,
        "event": "The empire fell; the catacombs were sealed and forgotten."
      },
      {
        "era": "Present",
        "yearsBefore": 10,
        "event": "Explorers broke the seal. Something ancient stirred within."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_osric_1",
        "name": "Osric",
        "role": "quest-giver",
        "locationId": "upper_shrine_10",
        "factionId": "undead_legion_2"
      },
      {
        "id": "npc_thorne_2",
        "name": "Thorne",
        "role": "guard",
        "locationId": "upper_shrine_10",
        "factionId": "bone_conclave_3"
      },
      {
        "id": "npc_maren_3",
        "name": "Maren",
        "role": "scholar",
        "locationId": "upper_shrine_10",
        "factionId": "undead_legion_2"
      },
      {
        "id": "npc_wynn_4",
        "name": "Wynn",
        "role": "blacksmith",
        "locationId": "upper_shrine_10"
      },
      {
        "id": "npc_mira_5",
        "name": "Mira",
        "role": "merchant",
        "locationId": "upper_shrine_10",
        "factionId": "undead_legion_2"
      },
      {
        "id": "npc_verity_6",
        "name": "Verity",
        "role": "guard",
        "locationId": "upper_shrine_10",
        "factionId": "undead_legion_2"
      }
    ]
  },
  "dark-fantasy": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "Dark Fantasy — genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "dark-fantasy",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "hollow_wastes_1",
          "name": "Hollow Wastes",
          "type": "dungeon",
          "biome": "dungeon",
          "x": 536,
          "y": 209,
          "dangerLevel": 8,
          "connectedTo": [
            "shadowed_reaches_2",
            "ashwood_vale_5",
            "withered_crossing_3"
          ],
          "imagePromptHint": "A landscape view of Hollow Wastes, dungeon environment, dark-fantasy artstyle"
        },
        {
          "id": "shadowed_reaches_2",
          "name": "Shadowed Reaches",
          "type": "mountains",
          "biome": "mountain",
          "x": 782,
          "y": 405,
          "dangerLevel": 3,
          "connectedTo": [
            "hollow_wastes_1",
            "withered_crossing_3"
          ],
          "imagePromptHint": "A landscape view of Shadowed Reaches, mountains environment, dark-fantasy artstyle"
        },
        {
          "id": "withered_crossing_3",
          "name": "Withered Crossing",
          "type": "wilderness",
          "biome": "plains",
          "x": 647,
          "y": 716,
          "dangerLevel": 4,
          "connectedTo": [
            "shadowed_reaches_2",
            "blighted_forest_4",
            "hollow_wastes_1"
          ],
          "imagePromptHint": "A landscape view of Withered Crossing, wilderness environment, dark-fantasy artstyle"
        },
        {
          "id": "blighted_forest_4",
          "name": "Blighted Forest",
          "type": "mountains",
          "biome": "mountain",
          "x": 318,
          "y": 711,
          "dangerLevel": 4,
          "connectedTo": [
            "withered_crossing_3",
            "ashwood_vale_5"
          ],
          "imagePromptHint": "A landscape view of Blighted Forest, mountains environment, dark-fantasy artstyle"
        },
        {
          "id": "ashwood_vale_5",
          "name": "Ashwood Vale",
          "type": "urban",
          "biome": "city",
          "x": 326,
          "y": 421,
          "dangerLevel": 5,
          "connectedTo": [
            "blighted_forest_4",
            "hollow_wastes_1"
          ],
          "imagePromptHint": "A landscape view of Ashwood Vale, urban environment, dark-fantasy artstyle"
        }
      ],
      "locations": [
        {
          "id": "hollow_chamber_1",
          "name": "Hollow Chamber",
          "type": "dungeon",
          "regionId": "hollow_wastes_1",
          "imagePromptHint": "A view of Hollow Chamber, dungeon structure, in Hollow Wastes, dungeon environment"
        },
        {
          "id": "hollow_overlook_2",
          "name": "Hollow Overlook",
          "type": "landmark",
          "regionId": "hollow_wastes_1",
          "imagePromptHint": "A view of Hollow Overlook, landmark structure, in Hollow Wastes, dungeon environment",
          "factionControl": "iron_crown_3"
        },
        {
          "id": "shadowed_gate_3",
          "name": "Shadowed Gate",
          "type": "landmark",
          "regionId": "shadowed_reaches_2",
          "imagePromptHint": "A view of Shadowed Gate, landmark structure, in Shadowed Reaches, mountains environment",
          "factionControl": "dusk_veil_2"
        },
        {
          "id": "shadowed_gate_4",
          "name": "Shadowed Gate",
          "type": "landmark",
          "regionId": "shadowed_reaches_2",
          "imagePromptHint": "A view of Shadowed Gate, landmark structure, in Shadowed Reaches, mountains environment",
          "factionControl": "dusk_veil_2"
        },
        {
          "id": "withered_debris_5",
          "name": "Withered Debris",
          "type": "ruins",
          "regionId": "withered_crossing_3",
          "imagePromptHint": "A view of Withered Debris, ruins structure, in Withered Crossing, wilderness environment"
        },
        {
          "id": "withered_monument_6",
          "name": "Withered Monument",
          "type": "landmark",
          "regionId": "withered_crossing_3",
          "imagePromptHint": "A view of Withered Monument, landmark structure, in Withered Crossing, wilderness environment",
          "factionControl": "pale_banner_1"
        },
        {
          "id": "blighted_pillar_7",
          "name": "Blighted Pillar",
          "type": "landmark",
          "regionId": "blighted_forest_4",
          "imagePromptHint": "A view of Blighted Pillar, landmark structure, in Blighted Forest, mountains environment",
          "factionControl": "dusk_veil_2"
        },
        {
          "id": "ashwood_gate_8",
          "name": "Ashwood Gate",
          "type": "landmark",
          "regionId": "ashwood_vale_5",
          "imagePromptHint": "A view of Ashwood Gate, landmark structure, in Ashwood Vale, urban environment",
          "factionControl": "pale_banner_1"
        },
        {
          "id": "ashwood_village_9",
          "name": "Ashwood Village",
          "type": "settlement",
          "regionId": "ashwood_vale_5",
          "imagePromptHint": "A view of Ashwood Village, settlement structure, in Ashwood Vale, urban environment",
          "population": 713,
          "factionControl": "pale_banner_1"
        }
      ]
    },
    "factions": [
      {
        "id": "pale_banner_1",
        "name": "Pale Banner",
        "type": "neutral",
        "power": 58,
        "resources": {
          "food": 38,
          "weapons": 35,
          "mana": 29
        },
        "enemies": [],
        "allies": [
          "iron_crown_3"
        ],
        "goals": []
      },
      {
        "id": "dusk_veil_2",
        "name": "Dusk Veil",
        "type": "friendly",
        "power": 61,
        "resources": {
          "food": 26,
          "weapons": 13,
          "mana": 34
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "iron_crown_3",
        "name": "Iron Crown",
        "type": "neutral",
        "power": 39,
        "resources": {
          "food": 28,
          "weapons": 43,
          "mana": 25
        },
        "enemies": [],
        "allies": [
          "pale_banner_1"
        ],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "Dawn Age",
        "yearsBefore": 1000,
        "event": "The land was shaped by warring gods whose wounds became mountains and seas."
      },
      {
        "era": "Blighting",
        "yearsBefore": 400,
        "event": "A curse swept across the realm, turning forests to ash and rivers to black ichor."
      },
      {
        "era": "Reformation",
        "yearsBefore": 50,
        "event": "Survivors built fragile alliances. The blight recedes, but its source is unknown."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_vesper_1",
        "name": "Vesper",
        "role": "quest-giver",
        "locationId": "withered_monument_6"
      },
      {
        "id": "npc_edric_2",
        "name": "Edric",
        "role": "guard",
        "locationId": "hollow_overlook_2"
      },
      {
        "id": "npc_gareth_3",
        "name": "Gareth",
        "role": "merchant",
        "locationId": "withered_monument_6",
        "factionId": "dusk_veil_2"
      },
      {
        "id": "npc_lira_4",
        "name": "Lira",
        "role": "guard",
        "locationId": "withered_monument_6",
        "factionId": "iron_crown_3"
      },
      {
        "id": "npc_talon_5",
        "name": "Talon",
        "role": "scholar",
        "locationId": "withered_monument_6",
        "factionId": "dusk_veil_2"
      },
      {
        "id": "npc_nessa_6",
        "name": "Nessa",
        "role": "merchant",
        "locationId": "blighted_pillar_7"
      }
    ]
  },
  "cyberpunk": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "Cyberpunk — genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "cyberpunk",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "high_junction_1",
          "name": "High Junction",
          "type": "urban",
          "biome": "city",
          "x": 502,
          "y": 285,
          "dangerLevel": 5,
          "connectedTo": [
            "sub_zone_2",
            "deep_hub_5",
            "core_zero_4"
          ],
          "imagePromptHint": "A landscape view of High Junction, urban environment, cyberpunk artstyle"
        },
        {
          "id": "sub_zone_2",
          "name": "Sub Zone",
          "type": "urban",
          "biome": "city",
          "x": 669,
          "y": 418,
          "dangerLevel": 2,
          "connectedTo": [
            "high_junction_1",
            "grid_spire_3"
          ],
          "imagePromptHint": "A landscape view of Sub Zone, urban environment, cyberpunk artstyle"
        },
        {
          "id": "grid_spire_3",
          "name": "Grid Spire",
          "type": "other",
          "biome": "wasteland",
          "x": 667,
          "y": 763,
          "dangerLevel": 6,
          "connectedTo": [
            "sub_zone_2",
            "core_zero_4"
          ],
          "imagePromptHint": "A landscape view of Grid Spire, other environment, cyberpunk artstyle"
        },
        {
          "id": "core_zero_4",
          "name": "Core Zero",
          "type": "urban",
          "biome": "city",
          "x": 407,
          "y": 648,
          "dangerLevel": 7,
          "connectedTo": [
            "grid_spire_3",
            "deep_hub_5",
            "high_junction_1"
          ],
          "imagePromptHint": "A landscape view of Core Zero, urban environment, cyberpunk artstyle"
        },
        {
          "id": "deep_hub_5",
          "name": "Deep Hub",
          "type": "other",
          "biome": "wasteland",
          "x": 270,
          "y": 384,
          "dangerLevel": 5,
          "connectedTo": [
            "core_zero_4",
            "high_junction_1"
          ],
          "imagePromptHint": "A landscape view of Deep Hub, other environment, cyberpunk artstyle"
        }
      ],
      "locations": [
        {
          "id": "high_town_1",
          "name": "High Town",
          "type": "settlement",
          "regionId": "high_junction_1",
          "imagePromptHint": "A view of High Town, settlement structure, in High Junction, urban environment",
          "population": 697,
          "factionControl": "null_net_1"
        },
        {
          "id": "high_post_2",
          "name": "High Post",
          "type": "settlement",
          "regionId": "high_junction_1",
          "imagePromptHint": "A view of High Post, settlement structure, in High Junction, urban environment",
          "population": 135,
          "factionControl": "null_net_1"
        },
        {
          "id": "sub_village_3",
          "name": "Sub Village",
          "type": "settlement",
          "regionId": "sub_zone_2",
          "imagePromptHint": "A view of Sub Village, settlement structure, in Sub Zone, urban environment",
          "population": 703,
          "factionControl": "ghost_collective_3"
        },
        {
          "id": "sub_monument_4",
          "name": "Sub Monument",
          "type": "landmark",
          "regionId": "sub_zone_2",
          "imagePromptHint": "A view of Sub Monument, landmark structure, in Sub Zone, urban environment",
          "factionControl": "ghost_collective_3"
        },
        {
          "id": "sub_camp_5",
          "name": "Sub Camp",
          "type": "settlement",
          "regionId": "sub_zone_2",
          "imagePromptHint": "A view of Sub Camp, settlement structure, in Sub Zone, urban environment",
          "population": 719,
          "factionControl": "ghost_collective_3"
        },
        {
          "id": "grid_ridge_6",
          "name": "Grid Ridge",
          "type": "wilderness",
          "regionId": "grid_spire_3",
          "imagePromptHint": "A view of Grid Ridge, wilderness structure, in Grid Spire, other environment"
        },
        {
          "id": "grid_village_7",
          "name": "Grid Village",
          "type": "settlement",
          "regionId": "grid_spire_3",
          "imagePromptHint": "A view of Grid Village, settlement structure, in Grid Spire, other environment",
          "population": 374,
          "factionControl": "byte_enclave_2"
        },
        {
          "id": "core_post_8",
          "name": "Core Post",
          "type": "settlement",
          "regionId": "core_zero_4",
          "imagePromptHint": "A view of Core Post, settlement structure, in Core Zero, urban environment",
          "population": 181,
          "factionControl": "ghost_collective_3"
        },
        {
          "id": "deep_monument_9",
          "name": "Deep Monument",
          "type": "landmark",
          "regionId": "deep_hub_5",
          "imagePromptHint": "A view of Deep Monument, landmark structure, in Deep Hub, other environment",
          "factionControl": "byte_enclave_2"
        }
      ]
    },
    "factions": [
      {
        "id": "null_net_1",
        "name": "Null Net",
        "type": "friendly",
        "power": 56,
        "resources": {
          "food": 34,
          "weapons": 45,
          "mana": 8
        },
        "enemies": [],
        "allies": [
          "byte_enclave_2"
        ],
        "goals": []
      },
      {
        "id": "byte_enclave_2",
        "name": "Byte Enclave",
        "type": "friendly",
        "power": 48,
        "resources": {
          "food": 36,
          "weapons": 17,
          "mana": 37
        },
        "enemies": [],
        "allies": [
          "null_net_1"
        ],
        "goals": []
      },
      {
        "id": "ghost_collective_3",
        "name": "Ghost Collective",
        "type": "friendly",
        "power": 37,
        "resources": {
          "food": 20,
          "weapons": 44,
          "mana": 33
        },
        "enemies": [],
        "allies": [],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "Pre-Collapse",
        "yearsBefore": 120,
        "event": "Mega-corporations absorbed nation-states. The megacity was built on their ruins."
      },
      {
        "era": "Blackout",
        "yearsBefore": 40,
        "event": "A cascading network failure plunged the city into chaos for three weeks."
      },
      {
        "era": "Now",
        "yearsBefore": 0,
        "event": "Power is fractured between corps, gangs, and rogue AI clusters."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_zara_1",
        "name": "Zara",
        "role": "quest-giver",
        "locationId": "high_town_1",
        "factionId": "byte_enclave_2"
      },
      {
        "id": "npc_cipher_2",
        "name": "Cipher",
        "role": "scout",
        "locationId": "deep_monument_9",
        "factionId": "byte_enclave_2"
      },
      {
        "id": "npc_axel_3",
        "name": "Axel",
        "role": "blacksmith",
        "locationId": "sub_village_3"
      },
      {
        "id": "npc_nova_4",
        "name": "Nova",
        "role": "blacksmith",
        "locationId": "sub_village_3",
        "factionId": "byte_enclave_2"
      },
      {
        "id": "npc_lyra_5",
        "name": "Lyra",
        "role": "blacksmith",
        "locationId": "sub_village_3",
        "factionId": "null_net_1"
      },
      {
        "id": "npc_ryn_6",
        "name": "Ryn",
        "role": "innkeeper",
        "locationId": "high_post_2"
      }
    ]
  },
  "post-apocalyptic": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "Post Apocalyptic — genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "post-apocalyptic",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "glassed_ruins_1",
          "name": "Glassed Ruins",
          "type": "urban",
          "biome": "city",
          "x": 477,
          "y": 279,
          "dangerLevel": 4,
          "connectedTo": [
            "silent_outskirts_2",
            "ashen_exclusion_zone_5"
          ],
          "imagePromptHint": "A landscape view of Glassed Ruins, urban environment, post-apocalyptic artstyle"
        },
        {
          "id": "silent_outskirts_2",
          "name": "Silent Outskirts",
          "type": "urban",
          "biome": "city",
          "x": 715,
          "y": 457,
          "dangerLevel": 5,
          "connectedTo": [
            "glassed_ruins_1",
            "broken_flats_3"
          ],
          "imagePromptHint": "A landscape view of Silent Outskirts, urban environment, post-apocalyptic artstyle",
          "hazard": "radiation"
        },
        {
          "id": "broken_flats_3",
          "name": "Broken Flats",
          "type": "ruins",
          "biome": "ruins",
          "x": 689,
          "y": 711,
          "dangerLevel": 7,
          "connectedTo": [
            "silent_outskirts_2",
            "rusted_corridor_4",
            "ashen_exclusion_zone_5"
          ],
          "imagePromptHint": "A landscape view of Broken Flats, ruins environment, post-apocalyptic artstyle",
          "hazard": "radiation"
        },
        {
          "id": "rusted_corridor_4",
          "name": "Rusted Corridor",
          "type": "ruins",
          "biome": "ruins",
          "x": 360,
          "y": 697,
          "dangerLevel": 7,
          "connectedTo": [
            "broken_flats_3",
            "ashen_exclusion_zone_5"
          ],
          "imagePromptHint": "A landscape view of Rusted Corridor, ruins environment, post-apocalyptic artstyle"
        },
        {
          "id": "ashen_exclusion_zone_5",
          "name": "Ashen Exclusion Zone",
          "type": "wilderness",
          "biome": "wasteland",
          "x": 249,
          "y": 437,
          "dangerLevel": 8,
          "connectedTo": [
            "rusted_corridor_4",
            "glassed_ruins_1",
            "broken_flats_3"
          ],
          "imagePromptHint": "A landscape view of Ashen Exclusion Zone, wilderness environment, post-apocalyptic artstyle",
          "hazard": "toxic"
        }
      ],
      "locations": [
        {
          "id": "glassed_spot_1",
          "name": "Glassed Spot",
          "type": "other",
          "regionId": "glassed_ruins_1",
          "imagePromptHint": "A view of Glassed Spot, other structure, in Glassed Ruins, urban environment"
        },
        {
          "id": "silent_spot_2",
          "name": "Silent Spot",
          "type": "other",
          "regionId": "silent_outskirts_2",
          "imagePromptHint": "A view of Silent Spot, other structure, in Silent Outskirts, urban environment"
        },
        {
          "id": "silent_pillar_3",
          "name": "Silent Pillar",
          "type": "landmark",
          "regionId": "silent_outskirts_2",
          "imagePromptHint": "A view of Silent Pillar, landmark structure, in Silent Outskirts, urban environment",
          "factionControl": "ember_wardens_1"
        },
        {
          "id": "silent_refuge_4",
          "name": "Silent Refuge",
          "type": "settlement",
          "regionId": "silent_outskirts_2",
          "imagePromptHint": "A view of Silent Refuge, settlement structure, in Silent Outskirts, urban environment",
          "population": 170,
          "factionControl": "ember_wardens_1"
        },
        {
          "id": "broken_shell_5",
          "name": "Broken Shell",
          "type": "ruins",
          "regionId": "broken_flats_3",
          "imagePromptHint": "A view of Broken Shell, ruins structure, in Broken Flats, ruins environment"
        },
        {
          "id": "broken_wreckage_6",
          "name": "Broken Wreckage",
          "type": "ruins",
          "regionId": "broken_flats_3",
          "imagePromptHint": "A view of Broken Wreckage, ruins structure, in Broken Flats, ruins environment"
        },
        {
          "id": "rusted_shrine_7",
          "name": "Rusted Shrine",
          "type": "landmark",
          "regionId": "rusted_corridor_4",
          "imagePromptHint": "A view of Rusted Shrine, landmark structure, in Rusted Corridor, ruins environment",
          "factionControl": "rust_caravan_2"
        },
        {
          "id": "rusted_shrine_8",
          "name": "Rusted Shrine",
          "type": "landmark",
          "regionId": "rusted_corridor_4",
          "imagePromptHint": "A view of Rusted Shrine, landmark structure, in Rusted Corridor, ruins environment",
          "factionControl": "rust_caravan_2"
        },
        {
          "id": "ashen_town_9",
          "name": "Ashen Town",
          "type": "settlement",
          "regionId": "ashen_exclusion_zone_5",
          "imagePromptHint": "A view of Ashen Town, settlement structure, in Ashen Exclusion Zone, wilderness environment",
          "population": 99,
          "factionControl": "ember_wardens_1"
        },
        {
          "id": "ashen_path_10",
          "name": "Ashen Path",
          "type": "wilderness",
          "regionId": "ashen_exclusion_zone_5",
          "imagePromptHint": "A view of Ashen Path, wilderness structure, in Ashen Exclusion Zone, wilderness environment"
        }
      ]
    },
    "factions": [
      {
        "id": "ember_wardens_1",
        "name": "Ember Wardens",
        "type": "neutral",
        "power": 68,
        "resources": {
          "food": 36,
          "weapons": 24,
          "mana": 31
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "rust_caravan_2",
        "name": "Rust Caravan",
        "type": "friendly",
        "power": 30,
        "resources": {
          "food": 39,
          "weapons": 29,
          "mana": 34
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "dust_tribe_3",
        "name": "Dust Tribe",
        "type": "friendly",
        "power": 49,
        "resources": {
          "food": 54,
          "weapons": 5,
          "mana": 23
        },
        "enemies": [],
        "allies": [],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "Before",
        "yearsBefore": 60,
        "event": "The old world ended in a week of fire; nobody agrees on who launched first."
      },
      {
        "era": "Dust Years",
        "yearsBefore": 30,
        "event": "Survivors crawled out of shelters into ash storms and fought over clean water."
      },
      {
        "era": "Now",
        "yearsBefore": 0,
        "event": "Caravans stitch the settlements together while raiders prowl the glowing wastes."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_flint_1",
        "name": "Flint",
        "role": "quest-giver",
        "locationId": "ashen_town_9",
        "factionId": "ember_wardens_1"
      },
      {
        "id": "npc_bram_2",
        "name": "Bram",
        "role": "scholar",
        "locationId": "rusted_shrine_8",
        "factionId": "rust_caravan_2"
      },
      {
        "id": "npc_echo_3",
        "name": "Echo",
        "role": "guard",
        "locationId": "ashen_town_9",
        "factionId": "rust_caravan_2"
      },
      {
        "id": "npc_dust_4",
        "name": "Dust",
        "role": "healer",
        "locationId": "ashen_town_9"
      },
      {
        "id": "npc_sable_5",
        "name": "Sable",
        "role": "merchant",
        "locationId": "rusted_shrine_7",
        "factionId": "ember_wardens_1"
      },
      {
        "id": "npc_harlan_6",
        "name": "Harlan",
        "role": "merchant",
        "locationId": "rusted_shrine_7",
        "factionId": "ember_wardens_1"
      }
    ]
  },
  "zombie-apocalypse": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "Zombie Apocalypse — genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "zombie-apocalypse",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "lost_outskirts_1",
          "name": "Lost Outskirts",
          "type": "wilderness",
          "biome": "plains",
          "x": 470,
          "y": 185,
          "dangerLevel": 7,
          "connectedTo": [
            "silent_highway_2",
            "burning_suburbs_5"
          ],
          "imagePromptHint": "A landscape view of Lost Outskirts, wilderness environment, zombie-apocalypse artstyle"
        },
        {
          "id": "silent_highway_2",
          "name": "Silent Highway",
          "type": "urban",
          "biome": "city",
          "x": 678,
          "y": 415,
          "dangerLevel": 7,
          "connectedTo": [
            "lost_outskirts_1",
            "walled_harbor_3",
            "barricaded_district_4"
          ],
          "imagePromptHint": "A landscape view of Silent Highway, urban environment, zombie-apocalypse artstyle",
          "hazard": "infested"
        },
        {
          "id": "walled_harbor_3",
          "name": "Walled Harbor",
          "type": "urban",
          "biome": "city",
          "x": 638,
          "y": 677,
          "dangerLevel": 7,
          "connectedTo": [
            "silent_highway_2",
            "barricaded_district_4"
          ],
          "imagePromptHint": "A landscape view of Walled Harbor, urban environment, zombie-apocalypse artstyle",
          "hazard": "infested"
        },
        {
          "id": "barricaded_district_4",
          "name": "Barricaded District",
          "type": "urban",
          "biome": "city",
          "x": 358,
          "y": 680,
          "dangerLevel": 5,
          "connectedTo": [
            "walled_harbor_3",
            "burning_suburbs_5",
            "silent_highway_2"
          ],
          "imagePromptHint": "A landscape view of Barricaded District, urban environment, zombie-apocalypse artstyle"
        },
        {
          "id": "burning_suburbs_5",
          "name": "Burning Suburbs",
          "type": "urban",
          "biome": "city",
          "x": 321,
          "y": 438,
          "dangerLevel": 7,
          "connectedTo": [
            "barricaded_district_4",
            "lost_outskirts_1"
          ],
          "imagePromptHint": "A landscape view of Burning Suburbs, urban environment, zombie-apocalypse artstyle"
        }
      ],
      "locations": [
        {
          "id": "lost_trail_1",
          "name": "Lost Trail",
          "type": "wilderness",
          "regionId": "lost_outskirts_1",
          "imagePromptHint": "A view of Lost Trail, wilderness structure, in Lost Outskirts, wilderness environment"
        },
        {
          "id": "lost_ridge_2",
          "name": "Lost Ridge",
          "type": "wilderness",
          "regionId": "lost_outskirts_1",
          "imagePromptHint": "A view of Lost Ridge, wilderness structure, in Lost Outskirts, wilderness environment"
        },
        {
          "id": "lost_ridge_3",
          "name": "Lost Ridge",
          "type": "wilderness",
          "regionId": "lost_outskirts_1",
          "imagePromptHint": "A view of Lost Ridge, wilderness structure, in Lost Outskirts, wilderness environment"
        },
        {
          "id": "silent_overlook_4",
          "name": "Silent Overlook",
          "type": "landmark",
          "regionId": "silent_highway_2",
          "imagePromptHint": "A view of Silent Overlook, landmark structure, in Silent Highway, urban environment",
          "factionControl": "harbor_convoy_3"
        },
        {
          "id": "silent_overlook_5",
          "name": "Silent Overlook",
          "type": "landmark",
          "regionId": "silent_highway_2",
          "imagePromptHint": "A view of Silent Overlook, landmark structure, in Silent Highway, urban environment",
          "factionControl": "harbor_convoy_3"
        },
        {
          "id": "walled_area_6",
          "name": "Walled Area",
          "type": "other",
          "regionId": "walled_harbor_3",
          "imagePromptHint": "A view of Walled Area, other structure, in Walled Harbor, urban environment"
        },
        {
          "id": "walled_monument_7",
          "name": "Walled Monument",
          "type": "landmark",
          "regionId": "walled_harbor_3",
          "imagePromptHint": "A view of Walled Monument, landmark structure, in Walled Harbor, urban environment",
          "factionControl": "ration_enclave_1"
        },
        {
          "id": "barricaded_shrine_8",
          "name": "Barricaded Shrine",
          "type": "landmark",
          "regionId": "barricaded_district_4",
          "imagePromptHint": "A view of Barricaded Shrine, landmark structure, in Barricaded District, urban environment",
          "factionControl": "last_watch_2"
        },
        {
          "id": "burning_pillar_9",
          "name": "Burning Pillar",
          "type": "landmark",
          "regionId": "burning_suburbs_5",
          "imagePromptHint": "A view of Burning Pillar, landmark structure, in Burning Suburbs, urban environment",
          "factionControl": "ration_enclave_1"
        },
        {
          "id": "burning_camp_10",
          "name": "Burning Camp",
          "type": "settlement",
          "regionId": "burning_suburbs_5",
          "imagePromptHint": "A view of Burning Camp, settlement structure, in Burning Suburbs, urban environment",
          "population": 623,
          "factionControl": "ration_enclave_1"
        },
        {
          "id": "burning_pillar_11",
          "name": "Burning Pillar",
          "type": "landmark",
          "regionId": "burning_suburbs_5",
          "imagePromptHint": "A view of Burning Pillar, landmark structure, in Burning Suburbs, urban environment",
          "factionControl": "ration_enclave_1"
        }
      ]
    },
    "factions": [
      {
        "id": "ration_enclave_1",
        "name": "Ration Enclave",
        "type": "hostile",
        "power": 69,
        "resources": {
          "food": 51,
          "weapons": 26,
          "mana": 38
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "last_watch_2",
        "name": "Last Watch",
        "type": "hostile",
        "power": 70,
        "resources": {
          "food": 41,
          "weapons": 28,
          "mana": 16
        },
        "enemies": [
          "harbor_convoy_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "harbor_convoy_3",
        "name": "Harbor Convoy",
        "type": "friendly",
        "power": 32,
        "resources": {
          "food": 10,
          "weapons": 30,
          "mana": 10
        },
        "enemies": [
          "last_watch_2"
        ],
        "allies": [],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "Outbreak",
        "yearsBefore": 3,
        "event": "Patient zero hit the evening news; by morning the highways were parking lots."
      },
      {
        "era": "Collapse",
        "yearsBefore": 2,
        "event": "The quarantine lines broke. The cities were abandoned to the dead."
      },
      {
        "era": "Now",
        "yearsBefore": 0,
        "event": "Scattered enclaves trade, scavenge, and count every bite mark."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_nadia_1",
        "name": "Nadia",
        "role": "quest-giver",
        "locationId": "silent_overlook_5",
        "factionId": "harbor_convoy_3"
      },
      {
        "id": "npc_briggs_2",
        "name": "Briggs",
        "role": "guard",
        "locationId": "barricaded_shrine_8"
      },
      {
        "id": "npc_quinn_3",
        "name": "Quinn",
        "role": "innkeeper",
        "locationId": "barricaded_shrine_8",
        "factionId": "last_watch_2"
      },
      {
        "id": "npc_cole_4",
        "name": "Cole",
        "role": "guard",
        "locationId": "silent_overlook_5",
        "factionId": "last_watch_2"
      },
      {
        "id": "npc_doc_5",
        "name": "Doc",
        "role": "scout",
        "locationId": "burning_pillar_11",
        "factionId": "harbor_convoy_3"
      },
      {
        "id": "npc_marla_6",
        "name": "Marla",
        "role": "quest-giver",
        "locationId": "silent_overlook_4",
        "factionId": "harbor_convoy_3"
      }
    ]
  },
  "scifi": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "Scifi — genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "scifi",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "inner_dome_1",
          "name": "Inner Dome",
          "type": "wilderness",
          "biome": "plains",
          "x": 502,
          "y": 220,
          "dangerLevel": 7,
          "connectedTo": [
            "outer_rift_2",
            "helios_plateau_5",
            "nova_sector_4"
          ],
          "imagePromptHint": "A landscape view of Inner Dome, wilderness environment, scifi artstyle",
          "hazard": "storm"
        },
        {
          "id": "outer_rift_2",
          "name": "Outer Rift",
          "type": "urban",
          "biome": "city",
          "x": 708,
          "y": 422,
          "dangerLevel": 2,
          "connectedTo": [
            "inner_dome_1",
            "cryo_colony_3"
          ],
          "imagePromptHint": "A landscape view of Outer Rift, urban environment, scifi artstyle"
        },
        {
          "id": "cryo_colony_3",
          "name": "Cryo Colony",
          "type": "wilderness",
          "biome": "plains",
          "x": 698,
          "y": 747,
          "dangerLevel": 2,
          "connectedTo": [
            "outer_rift_2",
            "nova_sector_4"
          ],
          "imagePromptHint": "A landscape view of Cryo Colony, wilderness environment, scifi artstyle"
        },
        {
          "id": "nova_sector_4",
          "name": "Nova Sector",
          "type": "other",
          "biome": "wasteland",
          "x": 371,
          "y": 725,
          "dangerLevel": 7,
          "connectedTo": [
            "cryo_colony_3",
            "helios_plateau_5",
            "inner_dome_1"
          ],
          "imagePromptHint": "A landscape view of Nova Sector, other environment, scifi artstyle"
        },
        {
          "id": "helios_plateau_5",
          "name": "Helios Plateau",
          "type": "urban",
          "biome": "city",
          "x": 290,
          "y": 437,
          "dangerLevel": 2,
          "connectedTo": [
            "nova_sector_4",
            "inner_dome_1"
          ],
          "imagePromptHint": "A landscape view of Helios Plateau, urban environment, scifi artstyle"
        }
      ],
      "locations": [
        {
          "id": "inner_post_1",
          "name": "Inner Post",
          "type": "settlement",
          "regionId": "inner_dome_1",
          "imagePromptHint": "A view of Inner Post, settlement structure, in Inner Dome, wilderness environment",
          "population": 783,
          "factionControl": "void_marines_2"
        },
        {
          "id": "inner_trail_2",
          "name": "Inner Trail",
          "type": "wilderness",
          "regionId": "inner_dome_1",
          "imagePromptHint": "A view of Inner Trail, wilderness structure, in Inner Dome, wilderness environment"
        },
        {
          "id": "inner_trail_3",
          "name": "Inner Trail",
          "type": "wilderness",
          "regionId": "inner_dome_1",
          "imagePromptHint": "A view of Inner Trail, wilderness structure, in Inner Dome, wilderness environment"
        },
        {
          "id": "outer_spot_4",
          "name": "Outer Spot",
          "type": "other",
          "regionId": "outer_rift_2",
          "imagePromptHint": "A view of Outer Spot, other structure, in Outer Rift, urban environment"
        },
        {
          "id": "outer_spot_5",
          "name": "Outer Spot",
          "type": "other",
          "regionId": "outer_rift_2",
          "imagePromptHint": "A view of Outer Spot, other structure, in Outer Rift, urban environment"
        },
        {
          "id": "outer_outpost_6",
          "name": "Outer Outpost",
          "type": "settlement",
          "regionId": "outer_rift_2",
          "imagePromptHint": "A view of Outer Outpost, settlement structure, in Outer Rift, urban environment",
          "population": 273,
          "factionControl": "orbital_collective_1"
        },
        {
          "id": "cryo_trail_7",
          "name": "Cryo Trail",
          "type": "wilderness",
          "regionId": "cryo_colony_3",
          "imagePromptHint": "A view of Cryo Trail, wilderness structure, in Cryo Colony, wilderness environment"
        },
        {
          "id": "cryo_village_8",
          "name": "Cryo Village",
          "type": "settlement",
          "regionId": "cryo_colony_3",
          "imagePromptHint": "A view of Cryo Village, settlement structure, in Cryo Colony, wilderness environment",
          "population": 631,
          "factionControl": "frontier_assembly_3"
        },
        {
          "id": "cryo_outpost_9",
          "name": "Cryo Outpost",
          "type": "settlement",
          "regionId": "cryo_colony_3",
          "imagePromptHint": "A view of Cryo Outpost, settlement structure, in Cryo Colony, wilderness environment",
          "population": 700,
          "factionControl": "frontier_assembly_3"
        },
        {
          "id": "nova_grove_10",
          "name": "Nova Grove",
          "type": "wilderness",
          "regionId": "nova_sector_4",
          "imagePromptHint": "A view of Nova Grove, wilderness structure, in Nova Sector, other environment"
        },
        {
          "id": "nova_spot_11",
          "name": "Nova Spot",
          "type": "other",
          "regionId": "nova_sector_4",
          "imagePromptHint": "A view of Nova Spot, other structure, in Nova Sector, other environment"
        },
        {
          "id": "nova_site_12",
          "name": "Nova Site",
          "type": "other",
          "regionId": "nova_sector_4",
          "imagePromptHint": "A view of Nova Site, other structure, in Nova Sector, other environment"
        },
        {
          "id": "helios_pillar_13",
          "name": "Helios Pillar",
          "type": "landmark",
          "regionId": "helios_plateau_5",
          "imagePromptHint": "A view of Helios Pillar, landmark structure, in Helios Plateau, urban environment",
          "factionControl": "frontier_assembly_3"
        },
        {
          "id": "helios_refuge_14",
          "name": "Helios Refuge",
          "type": "settlement",
          "regionId": "helios_plateau_5",
          "imagePromptHint": "A view of Helios Refuge, settlement structure, in Helios Plateau, urban environment",
          "population": 433,
          "factionControl": "frontier_assembly_3"
        }
      ]
    },
    "factions": [
      {
        "id": "orbital_collective_1",
        "name": "Orbital Collective",
        "type": "friendly",
        "power": 43,
        "resources": {
          "food": 26,
          "weapons": 50,
          "mana": 14
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "void_marines_2",
        "name": "Void Marines",
        "type": "friendly",
        "power": 57,
        "resources": {
          "food": 27,
          "weapons": 38,
          "mana": 16
        },
        "enemies": [
          "frontier_assembly_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "frontier_assembly_3",
        "name": "Frontier Assembly",
        "type": "neutral",
        "power": 30,
        "resources": {
          "food": 45,
          "weapons": 36,
          "mana": 5
        },
        "enemies": [
          "void_marines_2"
        ],
        "allies": [],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "Landfall",
        "yearsBefore": 90,
        "event": "The colony ships made planetfall and raised the first pressure domes."
      },
      {
        "era": "The Silence",
        "yearsBefore": 25,
        "event": "Contact with the homeworld went dark. No one knows why."
      },
      {
        "era": "Now",
        "yearsBefore": 0,
        "event": "Factions fight over terraformers, reactor fuel, and the meaning of the Silence."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_sol_1",
        "name": "Sol",
        "role": "quest-giver",
        "locationId": "cryo_village_8",
        "factionId": "frontier_assembly_3"
      },
      {
        "id": "npc_reyes_2",
        "name": "Reyes",
        "role": "innkeeper",
        "locationId": "inner_post_1",
        "factionId": "void_marines_2"
      },
      {
        "id": "npc_kestrel_3",
        "name": "Kestrel",
        "role": "blacksmith",
        "locationId": "cryo_village_8",
        "factionId": "frontier_assembly_3"
      },
      {
        "id": "npc_orin_4",
        "name": "Orin",
        "role": "innkeeper",
        "locationId": "helios_pillar_13",
        "factionId": "frontier_assembly_3"
      },
      {
        "id": "npc_halden_5",
        "name": "Halden",
        "role": "merchant",
        "locationId": "cryo_village_8",
        "factionId": "frontier_assembly_3"
      },
      {
        "id": "npc_nyx_6",
        "name": "Nyx",
        "role": "healer",
        "locationId": "cryo_village_8"
      }
    ]
  },
  "steampunk": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "Steampunk — genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "steampunk",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "gaslight_heights_1",
          "name": "Gaslight Heights",
          "type": "urban",
          "biome": "city",
          "x": 514,
          "y": 290,
          "dangerLevel": 5,
          "connectedTo": [
            "iron_docks_2",
            "brass_yards_5"
          ],
          "imagePromptHint": "A landscape view of Gaslight Heights, urban environment, steampunk artstyle",
          "hazard": "toxic"
        },
        {
          "id": "iron_docks_2",
          "name": "Iron Docks",
          "type": "wilderness",
          "biome": "plains",
          "x": 784,
          "y": 426,
          "dangerLevel": 2,
          "connectedTo": [
            "gaslight_heights_1",
            "steam_quarter_3",
            "copper_sprawl_4"
          ],
          "imagePromptHint": "A landscape view of Iron Docks, wilderness environment, steampunk artstyle"
        },
        {
          "id": "steam_quarter_3",
          "name": "Steam Quarter",
          "type": "urban",
          "biome": "city",
          "x": 643,
          "y": 649,
          "dangerLevel": 8,
          "connectedTo": [
            "iron_docks_2",
            "copper_sprawl_4"
          ],
          "imagePromptHint": "A landscape view of Steam Quarter, urban environment, steampunk artstyle",
          "hazard": "toxic"
        },
        {
          "id": "copper_sprawl_4",
          "name": "Copper Sprawl",
          "type": "wilderness",
          "biome": "plains",
          "x": 305,
          "y": 718,
          "dangerLevel": 3,
          "connectedTo": [
            "steam_quarter_3",
            "brass_yards_5",
            "iron_docks_2"
          ],
          "imagePromptHint": "A landscape view of Copper Sprawl, wilderness environment, steampunk artstyle"
        },
        {
          "id": "brass_yards_5",
          "name": "Brass Yards",
          "type": "ruins",
          "biome": "ruins",
          "x": 241,
          "y": 424,
          "dangerLevel": 8,
          "connectedTo": [
            "copper_sprawl_4",
            "gaslight_heights_1"
          ],
          "imagePromptHint": "A landscape view of Brass Yards, ruins environment, steampunk artstyle"
        }
      ],
      "locations": [
        {
          "id": "gaslight_ruin_1",
          "name": "Gaslight Ruin",
          "type": "landmark",
          "regionId": "gaslight_heights_1",
          "imagePromptHint": "A view of Gaslight Ruin, landmark structure, in Gaslight Heights, urban environment",
          "factionControl": "smokestack_combine_3"
        },
        {
          "id": "iron_monument_2",
          "name": "Iron Monument",
          "type": "landmark",
          "regionId": "iron_docks_2",
          "imagePromptHint": "A view of Iron Monument, landmark structure, in Iron Docks, wilderness environment",
          "factionControl": "copper_trust_2"
        },
        {
          "id": "iron_path_3",
          "name": "Iron Path",
          "type": "wilderness",
          "regionId": "iron_docks_2",
          "imagePromptHint": "A view of Iron Path, wilderness structure, in Iron Docks, wilderness environment"
        },
        {
          "id": "steam_shrine_4",
          "name": "Steam Shrine",
          "type": "landmark",
          "regionId": "steam_quarter_3",
          "imagePromptHint": "A view of Steam Shrine, landmark structure, in Steam Quarter, urban environment",
          "factionControl": "smokestack_combine_3"
        },
        {
          "id": "steam_post_5",
          "name": "Steam Post",
          "type": "settlement",
          "regionId": "steam_quarter_3",
          "imagePromptHint": "A view of Steam Post, settlement structure, in Steam Quarter, urban environment",
          "population": 144,
          "factionControl": "smokestack_combine_3"
        },
        {
          "id": "steam_gate_6",
          "name": "Steam Gate",
          "type": "landmark",
          "regionId": "steam_quarter_3",
          "imagePromptHint": "A view of Steam Gate, landmark structure, in Steam Quarter, urban environment",
          "factionControl": "smokestack_combine_3"
        },
        {
          "id": "copper_clearing_7",
          "name": "Copper Clearing",
          "type": "wilderness",
          "regionId": "copper_sprawl_4",
          "imagePromptHint": "A view of Copper Clearing, wilderness structure, in Copper Sprawl, wilderness environment"
        },
        {
          "id": "copper_shrine_8",
          "name": "Copper Shrine",
          "type": "landmark",
          "regionId": "copper_sprawl_4",
          "imagePromptHint": "A view of Copper Shrine, landmark structure, in Copper Sprawl, wilderness environment",
          "factionControl": "smokestack_combine_3"
        },
        {
          "id": "copper_hollow_9",
          "name": "Copper Hollow",
          "type": "wilderness",
          "regionId": "copper_sprawl_4",
          "imagePromptHint": "A view of Copper Hollow, wilderness structure, in Copper Sprawl, wilderness environment"
        },
        {
          "id": "brass_path_10",
          "name": "Brass Path",
          "type": "wilderness",
          "regionId": "brass_yards_5",
          "imagePromptHint": "A view of Brass Path, wilderness structure, in Brass Yards, ruins environment"
        }
      ]
    },
    "factions": [
      {
        "id": "cog_union_1",
        "name": "Cog Union",
        "type": "friendly",
        "power": 48,
        "resources": {
          "food": 47,
          "weapons": 31,
          "mana": 32
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "copper_trust_2",
        "name": "Copper Trust",
        "type": "neutral",
        "power": 37,
        "resources": {
          "food": 42,
          "weapons": 12,
          "mana": 8
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "smokestack_combine_3",
        "name": "Smokestack Combine",
        "type": "neutral",
        "power": 55,
        "resources": {
          "food": 58,
          "weapons": 22,
          "mana": 19
        },
        "enemies": [],
        "allies": [],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "Ignition",
        "yearsBefore": 150,
        "event": "The first aether engine roared to life and remade industry overnight."
      },
      {
        "era": "Smog Wars",
        "yearsBefore": 40,
        "event": "Guilds and crown clashed over engine patents; the sky turned permanently grey."
      },
      {
        "era": "Now",
        "yearsBefore": 0,
        "event": "Airships crowd the docks while inventors and spies race for the next breakthrough."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_phineas_1",
        "name": "Phineas",
        "role": "quest-giver",
        "locationId": "steam_post_5",
        "factionId": "copper_trust_2"
      },
      {
        "id": "npc_hattie_2",
        "name": "Hattie",
        "role": "scout",
        "locationId": "gaslight_ruin_1"
      },
      {
        "id": "npc_beatrix_3",
        "name": "Beatrix",
        "role": "quest-giver",
        "locationId": "gaslight_ruin_1",
        "factionId": "smokestack_combine_3"
      },
      {
        "id": "npc_ambrose_4",
        "name": "Ambrose",
        "role": "scout",
        "locationId": "steam_post_5",
        "factionId": "smokestack_combine_3"
      },
      {
        "id": "npc_silas_5",
        "name": "Silas",
        "role": "blacksmith",
        "locationId": "steam_gate_6",
        "factionId": "copper_trust_2"
      },
      {
        "id": "npc_elsie_6",
        "name": "Elsie",
        "role": "scholar",
        "locationId": "steam_gate_6"
      }
    ]
  },
  "cosmic-horror": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "Cosmic Horror — genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "cosmic-horror",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "pallid_reef_1",
          "name": "Pallid Reef",
          "type": "urban",
          "biome": "city",
          "x": 497,
          "y": 290,
          "dangerLevel": 7,
          "connectedTo": [
            "cyclopean_moor_2",
            "whispering_hollow_5",
            "mist_veiled_vale_3"
          ],
          "imagePromptHint": "A landscape view of Pallid Reef, urban environment, cosmic-horror artstyle",
          "hazard": "haunted"
        },
        {
          "id": "cyclopean_moor_2",
          "name": "Cyclopean Moor",
          "type": "wilderness",
          "biome": "swamp",
          "x": 752,
          "y": 383,
          "dangerLevel": 8,
          "connectedTo": [
            "pallid_reef_1",
            "mist_veiled_vale_3"
          ],
          "imagePromptHint": "A landscape view of Cyclopean Moor, wilderness environment, cosmic-horror artstyle",
          "hazard": "haunted"
        },
        {
          "id": "mist_veiled_vale_3",
          "name": "Mist-veiled Vale",
          "type": "wilderness",
          "biome": "swamp",
          "x": 677,
          "y": 729,
          "dangerLevel": 5,
          "connectedTo": [
            "cyclopean_moor_2",
            "drowned_shore_4",
            "pallid_reef_1"
          ],
          "imagePromptHint": "A landscape view of Mist-veiled Vale, wilderness environment, cosmic-horror artstyle"
        },
        {
          "id": "drowned_shore_4",
          "name": "Drowned Shore",
          "type": "wilderness",
          "biome": "swamp",
          "x": 360,
          "y": 750,
          "dangerLevel": 6,
          "connectedTo": [
            "mist_veiled_vale_3",
            "whispering_hollow_5"
          ],
          "imagePromptHint": "A landscape view of Drowned Shore, wilderness environment, cosmic-horror artstyle",
          "hazard": "haunted"
        },
        {
          "id": "whispering_hollow_5",
          "name": "Whispering Hollow",
          "type": "ocean",
          "biome": "sea",
          "x": 160,
          "y": 398,
          "dangerLevel": 5,
          "connectedTo": [
            "drowned_shore_4",
            "pallid_reef_1"
          ],
          "imagePromptHint": "A landscape view of Whispering Hollow, ocean environment, cosmic-horror artstyle"
        }
      ],
      "locations": [
        {
          "id": "pallid_gate_1",
          "name": "Pallid Gate",
          "type": "landmark",
          "regionId": "pallid_reef_1",
          "imagePromptHint": "A view of Pallid Gate, landmark structure, in Pallid Reef, urban environment",
          "factionControl": "esoteric_order_2"
        },
        {
          "id": "cyclopean_overlook_2",
          "name": "Cyclopean Overlook",
          "type": "landmark",
          "regionId": "cyclopean_moor_2",
          "imagePromptHint": "A view of Cyclopean Overlook, landmark structure, in Cyclopean Moor, wilderness environment",
          "factionControl": "midnight_circle_1"
        },
        {
          "id": "mist_veiled_wreckage_3",
          "name": "Mist-veiled Wreckage",
          "type": "ruins",
          "regionId": "mist_veiled_vale_3",
          "imagePromptHint": "A view of Mist-veiled Wreckage, ruins structure, in Mist-veiled Vale, wilderness environment"
        },
        {
          "id": "mist_veiled_ridge_4",
          "name": "Mist-veiled Ridge",
          "type": "wilderness",
          "regionId": "mist_veiled_vale_3",
          "imagePromptHint": "A view of Mist-veiled Ridge, wilderness structure, in Mist-veiled Vale, wilderness environment"
        },
        {
          "id": "drowned_remains_5",
          "name": "Drowned Remains",
          "type": "ruins",
          "regionId": "drowned_shore_4",
          "imagePromptHint": "A view of Drowned Remains, ruins structure, in Drowned Shore, wilderness environment"
        },
        {
          "id": "whispering_town_6",
          "name": "Whispering Town",
          "type": "settlement",
          "regionId": "whispering_hollow_5",
          "imagePromptHint": "A view of Whispering Town, settlement structure, in Whispering Hollow, ocean environment",
          "population": 396,
          "factionControl": "midnight_circle_1"
        }
      ]
    },
    "factions": [
      {
        "id": "midnight_circle_1",
        "name": "Midnight Circle",
        "type": "hostile",
        "power": 52,
        "resources": {
          "food": 52,
          "weapons": 12,
          "mana": 33
        },
        "enemies": [
          "yellow_tide_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "esoteric_order_2",
        "name": "Esoteric Order",
        "type": "hostile",
        "power": 71,
        "resources": {
          "food": 56,
          "weapons": 25,
          "mana": 5
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "yellow_tide_3",
        "name": "Yellow Tide",
        "type": "neutral",
        "power": 43,
        "resources": {
          "food": 26,
          "weapons": 47,
          "mana": 4
        },
        "enemies": [
          "midnight_circle_1"
        ],
        "allies": [],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "The Founding",
        "yearsBefore": 300,
        "event": "The port town grew rich on strange catches hauled from a sea that has no charts."
      },
      {
        "era": "The Vanishing",
        "yearsBefore": 60,
        "event": "An entire congregation walked into the fog one night and never returned."
      },
      {
        "era": "Now",
        "yearsBefore": 0,
        "event": "The tides whisper, the old families keep their secrets, and sleep brings shared dreams."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_cassilda_1",
        "name": "Cassilda",
        "role": "quest-giver",
        "locationId": "whispering_town_6",
        "factionId": "yellow_tide_3"
      },
      {
        "id": "npc_ophelia_2",
        "name": "Ophelia",
        "role": "innkeeper",
        "locationId": "cyclopean_overlook_2",
        "factionId": "yellow_tide_3"
      },
      {
        "id": "npc_lavinia_3",
        "name": "Lavinia",
        "role": "scout",
        "locationId": "cyclopean_overlook_2",
        "factionId": "yellow_tide_3"
      },
      {
        "id": "npc_ward_4",
        "name": "Ward",
        "role": "guard",
        "locationId": "cyclopean_overlook_2",
        "factionId": "midnight_circle_1"
      },
      {
        "id": "npc_marion_5",
        "name": "Marion",
        "role": "scout",
        "locationId": "cyclopean_overlook_2",
        "factionId": "esoteric_order_2"
      },
      {
        "id": "npc_ezekiel_6",
        "name": "Ezekiel",
        "role": "healer",
        "locationId": "whispering_town_6",
        "factionId": "midnight_circle_1"
      }
    ]
  },
  "oriental-fantasy": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "Oriental Fantasy — genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "oriental-fantasy",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "crane_forest_1",
          "name": "Crane Forest",
          "type": "mountains",
          "biome": "mountain",
          "x": 491,
          "y": 191,
          "dangerLevel": 8,
          "connectedTo": [
            "thunder_valley_2",
            "plum_blossom_terrace_5",
            "azure_coast_4"
          ],
          "imagePromptHint": "A landscape view of Crane Forest, mountains environment, oriental-fantasy artstyle",
          "hazard": "storm"
        },
        {
          "id": "thunder_valley_2",
          "name": "Thunder Valley",
          "type": "urban",
          "biome": "city",
          "x": 696,
          "y": 436,
          "dangerLevel": 8,
          "connectedTo": [
            "crane_forest_1",
            "lotus_pass_3"
          ],
          "imagePromptHint": "A landscape view of Thunder Valley, urban environment, oriental-fantasy artstyle"
        },
        {
          "id": "lotus_pass_3",
          "name": "Lotus Pass",
          "type": "forest",
          "biome": "forest",
          "x": 657,
          "y": 733,
          "dangerLevel": 7,
          "connectedTo": [
            "thunder_valley_2",
            "azure_coast_4"
          ],
          "imagePromptHint": "A landscape view of Lotus Pass, forest environment, oriental-fantasy artstyle",
          "hazard": "haunted"
        },
        {
          "id": "azure_coast_4",
          "name": "Azure Coast",
          "type": "wilderness",
          "biome": "plains",
          "x": 320,
          "y": 694,
          "dangerLevel": 5,
          "connectedTo": [
            "lotus_pass_3",
            "plum_blossom_terrace_5",
            "crane_forest_1"
          ],
          "imagePromptHint": "A landscape view of Azure Coast, wilderness environment, oriental-fantasy artstyle"
        },
        {
          "id": "plum_blossom_terrace_5",
          "name": "Plum Blossom Terraces",
          "type": "mountains",
          "biome": "mountain",
          "x": 268,
          "y": 352,
          "dangerLevel": 8,
          "connectedTo": [
            "azure_coast_4",
            "crane_forest_1"
          ],
          "imagePromptHint": "A landscape view of Plum Blossom Terraces, mountains environment, oriental-fantasy artstyle"
        }
      ],
      "locations": [
        {
          "id": "crane_path_1",
          "name": "Crane Path",
          "type": "wilderness",
          "regionId": "crane_forest_1",
          "imagePromptHint": "A view of Crane Path, wilderness structure, in Crane Forest, mountains environment"
        },
        {
          "id": "crane_husk_2",
          "name": "Crane Husk",
          "type": "ruins",
          "regionId": "crane_forest_1",
          "imagePromptHint": "A view of Crane Husk, ruins structure, in Crane Forest, mountains environment"
        },
        {
          "id": "crane_hollow_3",
          "name": "Crane Hollow",
          "type": "wilderness",
          "regionId": "crane_forest_1",
          "imagePromptHint": "A view of Crane Hollow, wilderness structure, in Crane Forest, mountains environment"
        },
        {
          "id": "thunder_spot_4",
          "name": "Thunder Spot",
          "type": "other",
          "regionId": "thunder_valley_2",
          "imagePromptHint": "A view of Thunder Spot, other structure, in Thunder Valley, urban environment"
        },
        {
          "id": "lotus_clearing_5",
          "name": "Lotus Clearing",
          "type": "wilderness",
          "regionId": "lotus_pass_3",
          "imagePromptHint": "A view of Lotus Clearing, wilderness structure, in Lotus Pass, forest environment"
        },
        {
          "id": "azure_ruin_6",
          "name": "Azure Ruin",
          "type": "landmark",
          "regionId": "azure_coast_4",
          "imagePromptHint": "A view of Azure Ruin, landmark structure, in Azure Coast, wilderness environment",
          "factionControl": "jade_guard_1"
        },
        {
          "id": "plum_ridge_7",
          "name": "Plum Ridge",
          "type": "wilderness",
          "regionId": "plum_blossom_terrace_5",
          "imagePromptHint": "A view of Plum Ridge, wilderness structure, in Plum Blossom Terraces, mountains environment"
        }
      ]
    },
    "factions": [
      {
        "id": "jade_guard_1",
        "name": "Jade Guard",
        "type": "hostile",
        "power": 58,
        "resources": {
          "food": 12,
          "weapons": 9,
          "mana": 38
        },
        "enemies": [
          "white_crane_company_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "wandering_court_2",
        "name": "Wandering Court",
        "type": "neutral",
        "power": 47,
        "resources": {
          "food": 24,
          "weapons": 25,
          "mana": 28
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "white_crane_company_3",
        "name": "White Crane Company",
        "type": "friendly",
        "power": 36,
        "resources": {
          "food": 32,
          "weapons": 14,
          "mana": 35
        },
        "enemies": [
          "jade_guard_1"
        ],
        "allies": [],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "Golden Reign",
        "yearsBefore": 400,
        "event": "A wise dynasty united the provinces under the Mandate of Heaven."
      },
      {
        "era": "The Sundering",
        "yearsBefore": 80,
        "event": "The mandate broke; warlords and rogue sects carved up the land."
      },
      {
        "era": "Now",
        "yearsBefore": 0,
        "event": "Wandering heroes, sect rivalries, and court intrigue decide the fate of the realm."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_yun_1",
        "name": "Yun",
        "role": "quest-giver",
        "locationId": "azure_ruin_6",
        "factionId": "white_crane_company_3"
      },
      {
        "id": "npc_sora_2",
        "name": "Sora",
        "role": "quest-giver",
        "locationId": "azure_ruin_6"
      },
      {
        "id": "npc_wei_3",
        "name": "Wei",
        "role": "innkeeper",
        "locationId": "azure_ruin_6",
        "factionId": "white_crane_company_3"
      },
      {
        "id": "npc_jin_4",
        "name": "Jin",
        "role": "healer",
        "locationId": "azure_ruin_6",
        "factionId": "wandering_court_2"
      },
      {
        "id": "npc_kaede_5",
        "name": "Kaede",
        "role": "scholar",
        "locationId": "azure_ruin_6"
      },
      {
        "id": "npc_haru_6",
        "name": "Haru",
        "role": "healer",
        "locationId": "azure_ruin_6",
        "factionId": "wandering_court_2"
      }
    ]
  },
  "default": {
    "format": "lorerelay-world-forge/1.0",
    "meta": {
      "worldName": "World of genrepr",
      "worldSeed": "genre-preset-slice1-parity",
      "theme": "default",
      "generationMethod": "ai-generated"
    },
    "geography": {
      "regions": [
        {
          "id": "old_reaches_1",
          "name": "Old Reaches",
          "type": "ruins",
          "biome": "ruins",
          "x": 512,
          "y": 246,
          "dangerLevel": 8,
          "connectedTo": [
            "north_wilds_2",
            "high_domain_5"
          ],
          "imagePromptHint": "A landscape view of Old Reaches, ruins environment, default artstyle"
        },
        {
          "id": "north_wilds_2",
          "name": "North Wilds",
          "type": "mountains",
          "biome": "mountain",
          "x": 745,
          "y": 392,
          "dangerLevel": 7,
          "connectedTo": [
            "old_reaches_1",
            "south_lands_3",
            "west_keep_4"
          ],
          "imagePromptHint": "A landscape view of North Wilds, mountains environment, default artstyle"
        },
        {
          "id": "south_lands_3",
          "name": "South Lands",
          "type": "ruins",
          "biome": "ruins",
          "x": 639,
          "y": 747,
          "dangerLevel": 5,
          "connectedTo": [
            "north_wilds_2",
            "west_keep_4"
          ],
          "imagePromptHint": "A landscape view of South Lands, ruins environment, default artstyle"
        },
        {
          "id": "west_keep_4",
          "name": "West Keep",
          "type": "forest",
          "biome": "forest",
          "x": 369,
          "y": 755,
          "dangerLevel": 2,
          "connectedTo": [
            "south_lands_3",
            "high_domain_5",
            "north_wilds_2"
          ],
          "imagePromptHint": "A landscape view of West Keep, forest environment, default artstyle"
        },
        {
          "id": "high_domain_5",
          "name": "High Domain",
          "type": "dungeon",
          "biome": "dungeon",
          "x": 245,
          "y": 423,
          "dangerLevel": 8,
          "connectedTo": [
            "west_keep_4",
            "old_reaches_1"
          ],
          "imagePromptHint": "A landscape view of High Domain, dungeon environment, default artstyle"
        }
      ],
      "locations": [
        {
          "id": "old_rubble_1",
          "name": "Old Rubble",
          "type": "ruins",
          "regionId": "old_reaches_1",
          "imagePromptHint": "A view of Old Rubble, ruins structure, in Old Reaches, ruins environment"
        },
        {
          "id": "old_ridge_2",
          "name": "Old Ridge",
          "type": "wilderness",
          "regionId": "old_reaches_1",
          "imagePromptHint": "A view of Old Ridge, wilderness structure, in Old Reaches, ruins environment"
        },
        {
          "id": "north_sanctum_3",
          "name": "North Sanctum",
          "type": "dungeon",
          "regionId": "north_wilds_2",
          "imagePromptHint": "A view of North Sanctum, dungeon structure, in North Wilds, mountains environment"
        },
        {
          "id": "south_remains_4",
          "name": "South Remains",
          "type": "ruins",
          "regionId": "south_lands_3",
          "imagePromptHint": "A view of South Remains, ruins structure, in South Lands, ruins environment"
        },
        {
          "id": "west_post_5",
          "name": "West Post",
          "type": "settlement",
          "regionId": "west_keep_4",
          "imagePromptHint": "A view of West Post, settlement structure, in West Keep, forest environment",
          "population": 186,
          "factionControl": "blue_order_2"
        },
        {
          "id": "west_ridge_6",
          "name": "West Ridge",
          "type": "wilderness",
          "regionId": "west_keep_4",
          "imagePromptHint": "A view of West Ridge, wilderness structure, in West Keep, forest environment"
        },
        {
          "id": "west_gate_7",
          "name": "West Gate",
          "type": "landmark",
          "regionId": "west_keep_4",
          "imagePromptHint": "A view of West Gate, landmark structure, in West Keep, forest environment",
          "factionControl": "blue_order_2"
        },
        {
          "id": "high_point_8",
          "name": "High Point",
          "type": "other",
          "regionId": "high_domain_5",
          "imagePromptHint": "A view of High Point, other structure, in High Domain, dungeon environment"
        },
        {
          "id": "high_shell_9",
          "name": "High Shell",
          "type": "ruins",
          "regionId": "high_domain_5",
          "imagePromptHint": "A view of High Shell, ruins structure, in High Domain, dungeon environment"
        }
      ]
    },
    "factions": [
      {
        "id": "stone_band_1",
        "name": "Stone Band",
        "type": "friendly",
        "power": 66,
        "resources": {
          "food": 31,
          "weapons": 46,
          "mana": 37
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "blue_order_2",
        "name": "Blue Order",
        "type": "friendly",
        "power": 69,
        "resources": {
          "food": 57,
          "weapons": 10,
          "mana": 12
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "gold_council_3",
        "name": "Gold Council",
        "type": "friendly",
        "power": 33,
        "resources": {
          "food": 27,
          "weapons": 37,
          "mana": 5
        },
        "enemies": [],
        "allies": [],
        "goals": []
      }
    ],
    "loreHistory": [
      {
        "era": "Founding",
        "yearsBefore": 500,
        "event": "The first settlers arrived and established the old kingdom."
      },
      {
        "era": "War of Crowns",
        "yearsBefore": 200,
        "event": "Rival factions tore the kingdom apart in a generation-long civil war."
      },
      {
        "era": "Uneasy Peace",
        "yearsBefore": 20,
        "event": "A fragile treaty holds, but old grudges simmer beneath the surface."
      }
    ],
    "initialNpcs": [
      {
        "id": "npc_jeld_1",
        "name": "Jeld",
        "role": "quest-giver",
        "locationId": "west_gate_7",
        "factionId": "gold_council_3"
      },
      {
        "id": "npc_ela_2",
        "name": "Ela",
        "role": "quest-giver",
        "locationId": "west_gate_7"
      },
      {
        "id": "npc_bren_3",
        "name": "Bren",
        "role": "innkeeper",
        "locationId": "west_gate_7",
        "factionId": "stone_band_1"
      },
      {
        "id": "npc_clara_4",
        "name": "Clara",
        "role": "healer",
        "locationId": "west_post_5",
        "factionId": "stone_band_1"
      },
      {
        "id": "npc_aela_5",
        "name": "Aela",
        "role": "healer",
        "locationId": "west_post_5"
      },
      {
        "id": "npc_fenn_6",
        "name": "Fenn",
        "role": "scout",
        "locationId": "west_gate_7",
        "factionId": "blue_order_2"
      }
    ]
  }
};

if (require.main === module) {
  console.log('Genre world preset Slice 1 baseline fixture loaded.');
}
