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
          "x": 139,
          "y": 494,
          "dangerLevel": 5,
          "connectedTo": [
            "sunken_chamber_2",
            "crumbled_depths_4"
          ],
          "imagePromptHint": "A landscape view of Deep Halls, dungeon environment, dungeon-crawler artstyle"
        },
        {
          "id": "sunken_chamber_2",
          "name": "Sunken Chamber",
          "type": "dungeon",
          "biome": "underground",
          "x": 249,
          "y": 477,
          "dangerLevel": 7,
          "connectedTo": [
            "deep_halls_1",
            "forsaken_warren_3",
            "crumbled_depths_4"
          ],
          "imagePromptHint": "A landscape view of Sunken Chamber, dungeon environment, dungeon-crawler artstyle"
        },
        {
          "id": "forsaken_warren_3",
          "name": "Forsaken Warren",
          "type": "ruins",
          "biome": "ruins",
          "x": 692,
          "y": 614,
          "dangerLevel": 7,
          "connectedTo": [
            "sunken_chamber_2",
            "upper_passage_5"
          ],
          "imagePromptHint": "A landscape view of Forsaken Warren, ruins environment, dungeon-crawler artstyle",
          "hazard": "haunted"
        },
        {
          "id": "crumbled_depths_4",
          "name": "Crumbled Depths",
          "type": "dungeon",
          "biome": "underground",
          "x": 207,
          "y": 627,
          "dangerLevel": 3,
          "connectedTo": [
            "deep_halls_1",
            "sunken_chamber_2"
          ],
          "imagePromptHint": "A landscape view of Crumbled Depths, dungeon environment, dungeon-crawler artstyle"
        },
        {
          "id": "upper_passage_5",
          "name": "Upper Passage",
          "type": "ruins",
          "biome": "ruins",
          "x": 793,
          "y": 662,
          "dangerLevel": 7,
          "connectedTo": [
            "forsaken_warren_3"
          ],
          "imagePromptHint": "A landscape view of Upper Passage, ruins environment, dungeon-crawler artstyle"
        }
      ],
      "locations": [
        {
          "id": "deep_gate_1",
          "name": "Deep Gate",
          "type": "landmark",
          "regionId": "deep_halls_1",
          "imagePromptHint": "A view of Deep Gate, landmark structure, in Deep Halls, dungeon environment",
          "factionControl": "cursed_guard_3"
        },
        {
          "id": "deep_chamber_2",
          "name": "Deep Chamber",
          "type": "dungeon",
          "regionId": "deep_halls_1",
          "imagePromptHint": "A view of Deep Chamber, dungeon structure, in Deep Halls, dungeon environment"
        },
        {
          "id": "sunken_monument_3",
          "name": "Sunken Monument",
          "type": "landmark",
          "regionId": "sunken_chamber_2",
          "imagePromptHint": "A view of Sunken Monument, landmark structure, in Sunken Chamber, dungeon environment",
          "factionControl": "iron_brotherhood_2"
        },
        {
          "id": "forsaken_shrine_4",
          "name": "Forsaken Shrine",
          "type": "landmark",
          "regionId": "forsaken_warren_3",
          "imagePromptHint": "A view of Forsaken Shrine, landmark structure, in Forsaken Warren, ruins environment",
          "factionControl": "cursed_guard_3"
        },
        {
          "id": "crumbled_chamber_5",
          "name": "Crumbled Chamber",
          "type": "dungeon",
          "regionId": "crumbled_depths_4",
          "imagePromptHint": "A view of Crumbled Chamber, dungeon structure, in Crumbled Depths, dungeon environment"
        },
        {
          "id": "crumbled_sanctum_6",
          "name": "Crumbled Sanctum",
          "type": "dungeon",
          "regionId": "crumbled_depths_4",
          "imagePromptHint": "A view of Crumbled Sanctum, dungeon structure, in Crumbled Depths, dungeon environment"
        },
        {
          "id": "crumbled_depths_7",
          "name": "Crumbled Depths",
          "type": "dungeon",
          "regionId": "crumbled_depths_4",
          "imagePromptHint": "A view of Crumbled Depths, dungeon structure, in Crumbled Depths, dungeon environment"
        },
        {
          "id": "upper_hollow_8",
          "name": "Upper Hollow",
          "type": "wilderness",
          "regionId": "upper_passage_5",
          "imagePromptHint": "A view of Upper Hollow, wilderness structure, in Upper Passage, ruins environment"
        },
        {
          "id": "upper_gate_9",
          "name": "Upper Gate",
          "type": "landmark",
          "regionId": "upper_passage_5",
          "imagePromptHint": "A view of Upper Gate, landmark structure, in Upper Passage, ruins environment",
          "factionControl": "iron_brotherhood_2"
        },
        {
          "id": "upper_debris_10",
          "name": "Upper Debris",
          "type": "ruins",
          "regionId": "upper_passage_5",
          "imagePromptHint": "A view of Upper Debris, ruins structure, in Upper Passage, ruins environment"
        }
      ]
    },
    "factions": [
      {
        "id": "stone_conclave_1",
        "name": "Stone Conclave",
        "type": "hostile",
        "power": 40,
        "resources": {
          "food": 59,
          "weapons": 45,
          "mana": 22
        },
        "enemies": [
          "cursed_guard_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "iron_brotherhood_2",
        "name": "Iron Brotherhood",
        "type": "hostile",
        "power": 75,
        "resources": {
          "food": 42,
          "weapons": 8,
          "mana": 9
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "cursed_guard_3",
        "name": "Cursed Guard",
        "type": "friendly",
        "power": 79,
        "resources": {
          "food": 28,
          "weapons": 18,
          "mana": 29
        },
        "enemies": [
          "stone_conclave_1"
        ],
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
        "locationId": "deep_gate_1",
        "factionId": "cursed_guard_3"
      },
      {
        "id": "npc_sable_2",
        "name": "Sable",
        "role": "guard",
        "locationId": "upper_gate_9",
        "factionId": "stone_conclave_1"
      },
      {
        "id": "npc_dusk_3",
        "name": "Dusk",
        "role": "scout",
        "locationId": "sunken_monument_3",
        "factionId": "stone_conclave_1"
      },
      {
        "id": "npc_cael_4",
        "name": "Cael",
        "role": "merchant",
        "locationId": "forsaken_shrine_4",
        "factionId": "iron_brotherhood_2"
      },
      {
        "id": "npc_maren_5",
        "name": "Maren",
        "role": "blacksmith",
        "locationId": "upper_gate_9",
        "factionId": "iron_brotherhood_2"
      },
      {
        "id": "npc_thorne_6",
        "name": "Thorne",
        "role": "scout",
        "locationId": "deep_gate_1"
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
          "x": 667,
          "y": 447,
          "dangerLevel": 8,
          "connectedTo": [
            "withered_crossing_3"
          ],
          "imagePromptHint": "A landscape view of Hollow Wastes, dungeon environment, dark-fantasy artstyle"
        },
        {
          "id": "shadowed_reaches_2",
          "name": "Shadowed Reaches",
          "type": "forest",
          "biome": "forest",
          "x": 251,
          "y": 393,
          "dangerLevel": 8,
          "connectedTo": [
            "ashwood_vale_5",
            "blighted_forest_4"
          ],
          "imagePromptHint": "A landscape view of Shadowed Reaches, forest environment, dark-fantasy artstyle"
        },
        {
          "id": "withered_crossing_3",
          "name": "Withered Crossing",
          "type": "urban",
          "biome": "city",
          "x": 510,
          "y": 418,
          "dangerLevel": 3,
          "connectedTo": [
            "hollow_wastes_1",
            "ashwood_vale_5"
          ],
          "imagePromptHint": "A landscape view of Withered Crossing, urban environment, dark-fantasy artstyle"
        },
        {
          "id": "blighted_forest_4",
          "name": "Blighted Forest",
          "type": "wilderness",
          "biome": "plains",
          "x": 68,
          "y": 542,
          "dangerLevel": 3,
          "connectedTo": [
            "shadowed_reaches_2",
            "ashwood_vale_5"
          ],
          "imagePromptHint": "A landscape view of Blighted Forest, wilderness environment, dark-fantasy artstyle"
        },
        {
          "id": "ashwood_vale_5",
          "name": "Ashwood Vale",
          "type": "forest",
          "biome": "forest",
          "x": 352,
          "y": 474,
          "dangerLevel": 8,
          "connectedTo": [
            "withered_crossing_3",
            "shadowed_reaches_2",
            "blighted_forest_4"
          ],
          "imagePromptHint": "A landscape view of Ashwood Vale, forest environment, dark-fantasy artstyle"
        }
      ],
      "locations": [
        {
          "id": "hollow_shrine_1",
          "name": "Hollow Shrine",
          "type": "landmark",
          "regionId": "hollow_wastes_1",
          "imagePromptHint": "A view of Hollow Shrine, landmark structure, in Hollow Wastes, dungeon environment",
          "factionControl": "ember_veil_2"
        },
        {
          "id": "hollow_pillar_2",
          "name": "Hollow Pillar",
          "type": "landmark",
          "regionId": "hollow_wastes_1",
          "imagePromptHint": "A view of Hollow Pillar, landmark structure, in Hollow Wastes, dungeon environment",
          "factionControl": "ember_veil_2"
        },
        {
          "id": "shadowed_gate_3",
          "name": "Shadowed Gate",
          "type": "landmark",
          "regionId": "shadowed_reaches_2",
          "imagePromptHint": "A view of Shadowed Gate, landmark structure, in Shadowed Reaches, forest environment",
          "factionControl": "crimson_throne_3"
        },
        {
          "id": "shadowed_trail_4",
          "name": "Shadowed Trail",
          "type": "wilderness",
          "regionId": "shadowed_reaches_2",
          "imagePromptHint": "A view of Shadowed Trail, wilderness structure, in Shadowed Reaches, forest environment"
        },
        {
          "id": "withered_shrine_5",
          "name": "Withered Shrine",
          "type": "landmark",
          "regionId": "withered_crossing_3",
          "imagePromptHint": "A view of Withered Shrine, landmark structure, in Withered Crossing, urban environment",
          "factionControl": "black_covenant_1"
        },
        {
          "id": "withered_shrine_6",
          "name": "Withered Shrine",
          "type": "landmark",
          "regionId": "withered_crossing_3",
          "imagePromptHint": "A view of Withered Shrine, landmark structure, in Withered Crossing, urban environment",
          "factionControl": "black_covenant_1"
        },
        {
          "id": "withered_pillar_7",
          "name": "Withered Pillar",
          "type": "landmark",
          "regionId": "withered_crossing_3",
          "imagePromptHint": "A view of Withered Pillar, landmark structure, in Withered Crossing, urban environment",
          "factionControl": "black_covenant_1"
        },
        {
          "id": "blighted_ruin_8",
          "name": "Blighted Ruin",
          "type": "landmark",
          "regionId": "blighted_forest_4",
          "imagePromptHint": "A view of Blighted Ruin, landmark structure, in Blighted Forest, wilderness environment",
          "factionControl": "ember_veil_2"
        },
        {
          "id": "blighted_path_9",
          "name": "Blighted Path",
          "type": "wilderness",
          "regionId": "blighted_forest_4",
          "imagePromptHint": "A view of Blighted Path, wilderness structure, in Blighted Forest, wilderness environment"
        },
        {
          "id": "ashwood_rubble_10",
          "name": "Ashwood Rubble",
          "type": "ruins",
          "regionId": "ashwood_vale_5",
          "imagePromptHint": "A view of Ashwood Rubble, ruins structure, in Ashwood Vale, forest environment"
        },
        {
          "id": "ashwood_outpost_11",
          "name": "Ashwood Outpost",
          "type": "settlement",
          "regionId": "ashwood_vale_5",
          "imagePromptHint": "A view of Ashwood Outpost, settlement structure, in Ashwood Vale, forest environment",
          "population": 470,
          "factionControl": "black_covenant_1"
        }
      ]
    },
    "factions": [
      {
        "id": "black_covenant_1",
        "name": "Black Covenant",
        "type": "neutral",
        "power": 36,
        "resources": {
          "food": 45,
          "weapons": 29,
          "mana": 31
        },
        "enemies": [
          "ember_veil_2"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "ember_veil_2",
        "name": "Ember Veil",
        "type": "hostile",
        "power": 44,
        "resources": {
          "food": 42,
          "weapons": 19,
          "mana": 11
        },
        "enemies": [
          "black_covenant_1"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "crimson_throne_3",
        "name": "Crimson Throne",
        "type": "hostile",
        "power": 67,
        "resources": {
          "food": 11,
          "weapons": 34,
          "mana": 40
        },
        "enemies": [],
        "allies": [],
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
        "id": "npc_soren_1",
        "name": "Soren",
        "role": "quest-giver",
        "locationId": "blighted_ruin_8",
        "factionId": "ember_veil_2"
      },
      {
        "id": "npc_bryn_2",
        "name": "Bryn",
        "role": "innkeeper",
        "locationId": "withered_shrine_6",
        "factionId": "ember_veil_2"
      },
      {
        "id": "npc_isolde_3",
        "name": "Isolde",
        "role": "scout",
        "locationId": "shadowed_gate_3",
        "factionId": "ember_veil_2"
      },
      {
        "id": "npc_gareth_4",
        "name": "Gareth",
        "role": "quest-giver",
        "locationId": "withered_shrine_5"
      },
      {
        "id": "npc_corvin_5",
        "name": "Corvin",
        "role": "guard",
        "locationId": "hollow_shrine_1",
        "factionId": "black_covenant_1"
      },
      {
        "id": "npc_lira_6",
        "name": "Lira",
        "role": "merchant",
        "locationId": "withered_shrine_5",
        "factionId": "black_covenant_1"
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
          "x": 397,
          "y": 613,
          "dangerLevel": 5,
          "connectedTo": [
            "grid_spire_3",
            "deep_hub_5",
            "sub_zone_2"
          ],
          "imagePromptHint": "A landscape view of High Junction, urban environment, cyberpunk artstyle"
        },
        {
          "id": "sub_zone_2",
          "name": "Sub Zone",
          "type": "urban",
          "biome": "city",
          "x": 284,
          "y": 621,
          "dangerLevel": 6,
          "connectedTo": [
            "grid_spire_3",
            "high_junction_1"
          ],
          "imagePromptHint": "A landscape view of Sub Zone, urban environment, cyberpunk artstyle",
          "hazard": "quarantine"
        },
        {
          "id": "grid_spire_3",
          "name": "Grid Spire",
          "type": "urban",
          "biome": "city",
          "x": 344,
          "y": 679,
          "dangerLevel": 2,
          "connectedTo": [
            "high_junction_1",
            "sub_zone_2"
          ],
          "imagePromptHint": "A landscape view of Grid Spire, urban environment, cyberpunk artstyle"
        },
        {
          "id": "core_zero_4",
          "name": "Core Zero",
          "type": "other",
          "biome": "wasteland",
          "x": 915,
          "y": 640,
          "dangerLevel": 5,
          "connectedTo": [
            "deep_hub_5"
          ],
          "imagePromptHint": "A landscape view of Core Zero, other environment, cyberpunk artstyle"
        },
        {
          "id": "deep_hub_5",
          "name": "Deep Hub",
          "type": "other",
          "biome": "wasteland",
          "x": 796,
          "y": 601,
          "dangerLevel": 9,
          "connectedTo": [
            "high_junction_1",
            "core_zero_4"
          ],
          "imagePromptHint": "A landscape view of Deep Hub, other environment, cyberpunk artstyle",
          "hazard": "toxic"
        }
      ],
      "locations": [
        {
          "id": "high_monument_1",
          "name": "High Monument",
          "type": "landmark",
          "regionId": "high_junction_1",
          "imagePromptHint": "A view of High Monument, landmark structure, in High Junction, urban environment",
          "factionControl": "static_protocol_2"
        },
        {
          "id": "high_camp_2",
          "name": "High Camp",
          "type": "settlement",
          "regionId": "high_junction_1",
          "imagePromptHint": "A view of High Camp, settlement structure, in High Junction, urban environment",
          "population": 719,
          "factionControl": "static_protocol_2"
        },
        {
          "id": "high_camp_3",
          "name": "High Camp",
          "type": "settlement",
          "regionId": "high_junction_1",
          "imagePromptHint": "A view of High Camp, settlement structure, in High Junction, urban environment",
          "population": 511,
          "factionControl": "static_protocol_2"
        },
        {
          "id": "sub_post_4",
          "name": "Sub Post",
          "type": "settlement",
          "regionId": "sub_zone_2",
          "imagePromptHint": "A view of Sub Post, settlement structure, in Sub Zone, urban environment",
          "population": 83,
          "factionControl": "cipher_net_3"
        },
        {
          "id": "sub_post_5",
          "name": "Sub Post",
          "type": "settlement",
          "regionId": "sub_zone_2",
          "imagePromptHint": "A view of Sub Post, settlement structure, in Sub Zone, urban environment",
          "population": 181,
          "factionControl": "cipher_net_3"
        },
        {
          "id": "sub_outpost_6",
          "name": "Sub Outpost",
          "type": "settlement",
          "regionId": "sub_zone_2",
          "imagePromptHint": "A view of Sub Outpost, settlement structure, in Sub Zone, urban environment",
          "population": 606,
          "factionControl": "cipher_net_3"
        },
        {
          "id": "grid_spot_7",
          "name": "Grid Spot",
          "type": "other",
          "regionId": "grid_spire_3",
          "imagePromptHint": "A view of Grid Spot, other structure, in Grid Spire, urban environment"
        },
        {
          "id": "core_area_8",
          "name": "Core Area",
          "type": "other",
          "regionId": "core_zero_4",
          "imagePromptHint": "A view of Core Area, other structure, in Core Zero, other environment"
        },
        {
          "id": "core_pillar_9",
          "name": "Core Pillar",
          "type": "landmark",
          "regionId": "core_zero_4",
          "imagePromptHint": "A view of Core Pillar, landmark structure, in Core Zero, other environment",
          "factionControl": "neon_enclave_1"
        },
        {
          "id": "deep_grove_10",
          "name": "Deep Grove",
          "type": "wilderness",
          "regionId": "deep_hub_5",
          "imagePromptHint": "A view of Deep Grove, wilderness structure, in Deep Hub, other environment"
        }
      ]
    },
    "factions": [
      {
        "id": "neon_enclave_1",
        "name": "Neon Enclave",
        "type": "hostile",
        "power": 40,
        "resources": {
          "food": 53,
          "weapons": 42,
          "mana": 8
        },
        "enemies": [
          "cipher_net_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "static_protocol_2",
        "name": "Static Protocol",
        "type": "neutral",
        "power": 77,
        "resources": {
          "food": 56,
          "weapons": 38,
          "mana": 4
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "cipher_net_3",
        "name": "Cipher Net",
        "type": "neutral",
        "power": 71,
        "resources": {
          "food": 47,
          "weapons": 12,
          "mana": 24
        },
        "enemies": [
          "neon_enclave_1"
        ],
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
        "id": "npc_dex_1",
        "name": "Dex",
        "role": "quest-giver",
        "locationId": "sub_post_5",
        "factionId": "cipher_net_3"
      },
      {
        "id": "npc_nova_2",
        "name": "Nova",
        "role": "guard",
        "locationId": "high_camp_2",
        "factionId": "static_protocol_2"
      },
      {
        "id": "npc_flux_3",
        "name": "Flux",
        "role": "merchant",
        "locationId": "sub_outpost_6"
      },
      {
        "id": "npc_lyra_4",
        "name": "Lyra",
        "role": "scout",
        "locationId": "sub_post_4",
        "factionId": "cipher_net_3"
      },
      {
        "id": "npc_kira_5",
        "name": "Kira",
        "role": "guard",
        "locationId": "high_camp_2",
        "factionId": "neon_enclave_1"
      },
      {
        "id": "npc_zara_6",
        "name": "Zara",
        "role": "merchant",
        "locationId": "high_camp_3",
        "factionId": "cipher_net_3"
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
          "x": 535,
          "y": 659,
          "dangerLevel": 7,
          "connectedTo": [
            "rusted_corridor_4",
            "ashen_exclusion_zone_5"
          ],
          "imagePromptHint": "A landscape view of Glassed Ruins, urban environment, post-apocalyptic artstyle",
          "hazard": "radiation"
        },
        {
          "id": "silent_outskirts_2",
          "name": "Silent Outskirts",
          "type": "wilderness",
          "biome": "wasteland",
          "x": 694,
          "y": 347,
          "dangerLevel": 7,
          "connectedTo": [
            "ashen_exclusion_zone_5",
            "broken_flats_3"
          ],
          "imagePromptHint": "A landscape view of Silent Outskirts, wilderness environment, post-apocalyptic artstyle"
        },
        {
          "id": "broken_flats_3",
          "name": "Broken Flats",
          "type": "wilderness",
          "biome": "wasteland",
          "x": 885,
          "y": 372,
          "dangerLevel": 5,
          "connectedTo": [
            "silent_outskirts_2",
            "ashen_exclusion_zone_5"
          ],
          "imagePromptHint": "A landscape view of Broken Flats, wilderness environment, post-apocalyptic artstyle",
          "hazard": "radiation"
        },
        {
          "id": "rusted_corridor_4",
          "name": "Rusted Corridor",
          "type": "urban",
          "biome": "city",
          "x": 379,
          "y": 538,
          "dangerLevel": 6,
          "connectedTo": [
            "glassed_ruins_1"
          ],
          "imagePromptHint": "A landscape view of Rusted Corridor, urban environment, post-apocalyptic artstyle",
          "hazard": "radiation"
        },
        {
          "id": "ashen_exclusion_zone_5",
          "name": "Ashen Exclusion Zone",
          "type": "wilderness",
          "biome": "wasteland",
          "x": 640,
          "y": 491,
          "dangerLevel": 9,
          "connectedTo": [
            "glassed_ruins_1",
            "silent_outskirts_2",
            "broken_flats_3"
          ],
          "imagePromptHint": "A landscape view of Ashen Exclusion Zone, wilderness environment, post-apocalyptic artstyle",
          "hazard": "toxic"
        }
      ],
      "locations": [
        {
          "id": "glassed_village_1",
          "name": "Glassed Village",
          "type": "settlement",
          "regionId": "glassed_ruins_1",
          "imagePromptHint": "A view of Glassed Village, settlement structure, in Glassed Ruins, urban environment",
          "population": 539,
          "factionControl": "scrap_pact_3"
        },
        {
          "id": "silent_hollow_2",
          "name": "Silent Hollow",
          "type": "wilderness",
          "regionId": "silent_outskirts_2",
          "imagePromptHint": "A view of Silent Hollow, wilderness structure, in Silent Outskirts, wilderness environment"
        },
        {
          "id": "broken_path_3",
          "name": "Broken Path",
          "type": "wilderness",
          "regionId": "broken_flats_3",
          "imagePromptHint": "A view of Broken Path, wilderness structure, in Broken Flats, wilderness environment"
        },
        {
          "id": "broken_hollow_4",
          "name": "Broken Hollow",
          "type": "wilderness",
          "regionId": "broken_flats_3",
          "imagePromptHint": "A view of Broken Hollow, wilderness structure, in Broken Flats, wilderness environment"
        },
        {
          "id": "broken_town_5",
          "name": "Broken Town",
          "type": "settlement",
          "regionId": "broken_flats_3",
          "imagePromptHint": "A view of Broken Town, settlement structure, in Broken Flats, wilderness environment",
          "population": 99,
          "factionControl": "rust_raiders_1"
        },
        {
          "id": "rusted_point_6",
          "name": "Rusted Point",
          "type": "other",
          "regionId": "rusted_corridor_4",
          "imagePromptHint": "A view of Rusted Point, other structure, in Rusted Corridor, urban environment"
        },
        {
          "id": "ashen_ruin_7",
          "name": "Ashen Ruin",
          "type": "landmark",
          "regionId": "ashen_exclusion_zone_5",
          "imagePromptHint": "A view of Ashen Ruin, landmark structure, in Ashen Exclusion Zone, wilderness environment",
          "factionControl": "salvage_tribe_2"
        },
        {
          "id": "ashen_camp_8",
          "name": "Ashen Camp",
          "type": "settlement",
          "regionId": "ashen_exclusion_zone_5",
          "imagePromptHint": "A view of Ashen Camp, settlement structure, in Ashen Exclusion Zone, wilderness environment",
          "population": 419,
          "factionControl": "salvage_tribe_2"
        },
        {
          "id": "ashen_shrine_9",
          "name": "Ashen Shrine",
          "type": "landmark",
          "regionId": "ashen_exclusion_zone_5",
          "imagePromptHint": "A view of Ashen Shrine, landmark structure, in Ashen Exclusion Zone, wilderness environment",
          "factionControl": "salvage_tribe_2"
        }
      ]
    },
    "factions": [
      {
        "id": "rust_raiders_1",
        "name": "Rust Raiders",
        "type": "friendly",
        "power": 75,
        "resources": {
          "food": 29,
          "weapons": 45,
          "mana": 0
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "salvage_tribe_2",
        "name": "Salvage Tribe",
        "type": "neutral",
        "power": 67,
        "resources": {
          "food": 60,
          "weapons": 37,
          "mana": 16
        },
        "enemies": [
          "scrap_pact_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "scrap_pact_3",
        "name": "Scrap Pact",
        "type": "neutral",
        "power": 47,
        "resources": {
          "food": 45,
          "weapons": 23,
          "mana": 40
        },
        "enemies": [
          "salvage_tribe_2"
        ],
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
        "id": "npc_sable_1",
        "name": "Sable",
        "role": "quest-giver",
        "locationId": "ashen_camp_8"
      },
      {
        "id": "npc_tessa_2",
        "name": "Tessa",
        "role": "healer",
        "locationId": "ashen_shrine_9",
        "factionId": "salvage_tribe_2"
      },
      {
        "id": "npc_juno_3",
        "name": "Juno",
        "role": "merchant",
        "locationId": "broken_town_5",
        "factionId": "salvage_tribe_2"
      },
      {
        "id": "npc_mave_4",
        "name": "Mave",
        "role": "guard",
        "locationId": "broken_town_5",
        "factionId": "rust_raiders_1"
      },
      {
        "id": "npc_bram_5",
        "name": "Bram",
        "role": "guard",
        "locationId": "ashen_ruin_7",
        "factionId": "rust_raiders_1"
      },
      {
        "id": "npc_echo_6",
        "name": "Echo",
        "role": "blacksmith",
        "locationId": "ashen_ruin_7",
        "factionId": "rust_raiders_1"
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
          "x": 493,
          "y": 660,
          "dangerLevel": 9,
          "connectedTo": [
            "walled_harbor_3",
            "burning_suburbs_5",
            "barricaded_district_4",
            "silent_highway_2"
          ],
          "imagePromptHint": "A landscape view of Lost Outskirts, wilderness environment, zombie-apocalypse artstyle",
          "hazard": "quarantine"
        },
        {
          "id": "silent_highway_2",
          "name": "Silent Highway",
          "type": "urban",
          "biome": "city",
          "x": 487,
          "y": 223,
          "dangerLevel": 5,
          "connectedTo": [
            "lost_outskirts_1"
          ],
          "imagePromptHint": "A landscape view of Silent Highway, urban environment, zombie-apocalypse artstyle",
          "hazard": "infested"
        },
        {
          "id": "walled_harbor_3",
          "name": "Walled Harbor",
          "type": "wilderness",
          "biome": "plains",
          "x": 611,
          "y": 689,
          "dangerLevel": 6,
          "connectedTo": [
            "lost_outskirts_1"
          ],
          "imagePromptHint": "A landscape view of Walled Harbor, wilderness environment, zombie-apocalypse artstyle",
          "hazard": "quarantine"
        },
        {
          "id": "barricaded_district_4",
          "name": "Barricaded District",
          "type": "wilderness",
          "biome": "plains",
          "x": 482,
          "y": 841,
          "dangerLevel": 7,
          "connectedTo": [
            "lost_outskirts_1",
            "burning_suburbs_5"
          ],
          "imagePromptHint": "A landscape view of Barricaded District, wilderness environment, zombie-apocalypse artstyle",
          "hazard": "quarantine"
        },
        {
          "id": "burning_suburbs_5",
          "name": "Burning Suburbs",
          "type": "ruins",
          "biome": "ruins",
          "x": 412,
          "y": 742,
          "dangerLevel": 9,
          "connectedTo": [
            "lost_outskirts_1",
            "barricaded_district_4"
          ],
          "imagePromptHint": "A landscape view of Burning Suburbs, ruins environment, zombie-apocalypse artstyle",
          "hazard": "infested"
        }
      ],
      "locations": [
        {
          "id": "lost_husk_1",
          "name": "Lost Husk",
          "type": "ruins",
          "regionId": "lost_outskirts_1",
          "imagePromptHint": "A view of Lost Husk, ruins structure, in Lost Outskirts, wilderness environment"
        },
        {
          "id": "lost_wreckage_2",
          "name": "Lost Wreckage",
          "type": "ruins",
          "regionId": "lost_outskirts_1",
          "imagePromptHint": "A view of Lost Wreckage, ruins structure, in Lost Outskirts, wilderness environment"
        },
        {
          "id": "lost_wreckage_3",
          "name": "Lost Wreckage",
          "type": "ruins",
          "regionId": "lost_outskirts_1",
          "imagePromptHint": "A view of Lost Wreckage, ruins structure, in Lost Outskirts, wilderness environment"
        },
        {
          "id": "silent_shrine_4",
          "name": "Silent Shrine",
          "type": "landmark",
          "regionId": "silent_highway_2",
          "imagePromptHint": "A view of Silent Shrine, landmark structure, in Silent Highway, urban environment",
          "factionControl": "free_convoy_3"
        },
        {
          "id": "silent_shrine_5",
          "name": "Silent Shrine",
          "type": "landmark",
          "regionId": "silent_highway_2",
          "imagePromptHint": "A view of Silent Shrine, landmark structure, in Silent Highway, urban environment",
          "factionControl": "free_convoy_3"
        },
        {
          "id": "walled_post_6",
          "name": "Walled Post",
          "type": "settlement",
          "regionId": "walled_harbor_3",
          "imagePromptHint": "A view of Walled Post, settlement structure, in Walled Harbor, wilderness environment",
          "population": 334,
          "factionControl": "safe_council_1"
        },
        {
          "id": "walled_monument_7",
          "name": "Walled Monument",
          "type": "landmark",
          "regionId": "walled_harbor_3",
          "imagePromptHint": "A view of Walled Monument, landmark structure, in Walled Harbor, wilderness environment",
          "factionControl": "safe_council_1"
        },
        {
          "id": "walled_post_8",
          "name": "Walled Post",
          "type": "settlement",
          "regionId": "walled_harbor_3",
          "imagePromptHint": "A view of Walled Post, settlement structure, in Walled Harbor, wilderness environment",
          "population": 237,
          "factionControl": "safe_council_1"
        },
        {
          "id": "barricaded_husk_9",
          "name": "Barricaded Husk",
          "type": "ruins",
          "regionId": "barricaded_district_4",
          "imagePromptHint": "A view of Barricaded Husk, ruins structure, in Barricaded District, wilderness environment"
        },
        {
          "id": "barricaded_husk_10",
          "name": "Barricaded Husk",
          "type": "ruins",
          "regionId": "barricaded_district_4",
          "imagePromptHint": "A view of Barricaded Husk, ruins structure, in Barricaded District, wilderness environment"
        },
        {
          "id": "burning_lair_11",
          "name": "Burning Lair",
          "type": "dungeon",
          "regionId": "burning_suburbs_5",
          "imagePromptHint": "A view of Burning Lair, dungeon structure, in Burning Suburbs, ruins environment"
        }
      ]
    },
    "factions": [
      {
        "id": "safe_council_1",
        "name": "Safe Council",
        "type": "neutral",
        "power": 69,
        "resources": {
          "food": 12,
          "weapons": 5,
          "mana": 22
        },
        "enemies": [
          "free_convoy_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "grey_militia_2",
        "name": "Grey Militia",
        "type": "hostile",
        "power": 77,
        "resources": {
          "food": 29,
          "weapons": 18,
          "mana": 26
        },
        "enemies": [
          "free_convoy_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "free_convoy_3",
        "name": "Free Convoy",
        "type": "neutral",
        "power": 51,
        "resources": {
          "food": 44,
          "weapons": 21,
          "mana": 34
        },
        "enemies": [
          "grey_militia_2",
          "safe_council_1"
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
        "id": "npc_hutch_1",
        "name": "Hutch",
        "role": "quest-giver",
        "locationId": "walled_monument_7",
        "factionId": "safe_council_1"
      },
      {
        "id": "npc_reese_2",
        "name": "Reese",
        "role": "quest-giver",
        "locationId": "walled_post_6",
        "factionId": "free_convoy_3"
      },
      {
        "id": "npc_sam_3",
        "name": "Sam",
        "role": "scout",
        "locationId": "walled_post_8",
        "factionId": "safe_council_1"
      },
      {
        "id": "npc_briggs_4",
        "name": "Briggs",
        "role": "scholar",
        "locationId": "walled_monument_7",
        "factionId": "free_convoy_3"
      },
      {
        "id": "npc_ivy_5",
        "name": "Ivy",
        "role": "guard",
        "locationId": "walled_post_6",
        "factionId": "safe_council_1"
      },
      {
        "id": "npc_nadia_6",
        "name": "Nadia",
        "role": "guard",
        "locationId": "walled_monument_7",
        "factionId": "free_convoy_3"
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
          "x": 445,
          "y": 657,
          "dangerLevel": 5,
          "connectedTo": [
            "cryo_colony_3",
            "nova_sector_4",
            "helios_plateau_5"
          ],
          "imagePromptHint": "A landscape view of Inner Dome, wilderness environment, scifi artstyle"
        },
        {
          "id": "outer_rift_2",
          "name": "Outer Rift",
          "type": "urban",
          "biome": "city",
          "x": 691,
          "y": 382,
          "dangerLevel": 2,
          "connectedTo": [
            "cryo_colony_3"
          ],
          "imagePromptHint": "A landscape view of Outer Rift, urban environment, scifi artstyle"
        },
        {
          "id": "cryo_colony_3",
          "name": "Cryo Colony",
          "type": "wilderness",
          "biome": "plains",
          "x": 505,
          "y": 542,
          "dangerLevel": 6,
          "connectedTo": [
            "inner_dome_1",
            "outer_rift_2"
          ],
          "imagePromptHint": "A landscape view of Cryo Colony, wilderness environment, scifi artstyle"
        },
        {
          "id": "nova_sector_4",
          "name": "Nova Sector",
          "type": "other",
          "biome": "wasteland",
          "x": 309,
          "y": 661,
          "dangerLevel": 5,
          "connectedTo": [
            "inner_dome_1",
            "helios_plateau_5"
          ],
          "imagePromptHint": "A landscape view of Nova Sector, other environment, scifi artstyle"
        },
        {
          "id": "helios_plateau_5",
          "name": "Helios Plateau",
          "type": "other",
          "biome": "wasteland",
          "x": 460,
          "y": 797,
          "dangerLevel": 9,
          "connectedTo": [
            "inner_dome_1",
            "nova_sector_4"
          ],
          "imagePromptHint": "A landscape view of Helios Plateau, other environment, scifi artstyle",
          "hazard": "radiation"
        }
      ],
      "locations": [
        {
          "id": "inner_refuge_1",
          "name": "Inner Refuge",
          "type": "settlement",
          "regionId": "inner_dome_1",
          "imagePromptHint": "A view of Inner Refuge, settlement structure, in Inner Dome, wilderness environment",
          "population": 680,
          "factionControl": "quantum_assembly_2"
        },
        {
          "id": "inner_monument_2",
          "name": "Inner Monument",
          "type": "landmark",
          "regionId": "inner_dome_1",
          "imagePromptHint": "A view of Inner Monument, landmark structure, in Inner Dome, wilderness environment",
          "factionControl": "quantum_assembly_2"
        },
        {
          "id": "outer_ruin_3",
          "name": "Outer Ruin",
          "type": "landmark",
          "regionId": "outer_rift_2",
          "imagePromptHint": "A view of Outer Ruin, landmark structure, in Outer Rift, urban environment",
          "factionControl": "quantum_assembly_2"
        },
        {
          "id": "cryo_monument_4",
          "name": "Cryo Monument",
          "type": "landmark",
          "regionId": "cryo_colony_3",
          "imagePromptHint": "A view of Cryo Monument, landmark structure, in Cryo Colony, wilderness environment",
          "factionControl": "stellar_directorate_1"
        },
        {
          "id": "nova_overlook_5",
          "name": "Nova Overlook",
          "type": "landmark",
          "regionId": "nova_sector_4",
          "imagePromptHint": "A view of Nova Overlook, landmark structure, in Nova Sector, other environment",
          "factionControl": "red_dust_initiative_3"
        },
        {
          "id": "nova_gate_6",
          "name": "Nova Gate",
          "type": "landmark",
          "regionId": "nova_sector_4",
          "imagePromptHint": "A view of Nova Gate, landmark structure, in Nova Sector, other environment",
          "factionControl": "red_dust_initiative_3"
        },
        {
          "id": "helios_pillar_7",
          "name": "Helios Pillar",
          "type": "landmark",
          "regionId": "helios_plateau_5",
          "imagePromptHint": "A view of Helios Pillar, landmark structure, in Helios Plateau, other environment",
          "factionControl": "stellar_directorate_1"
        },
        {
          "id": "helios_post_8",
          "name": "Helios Post",
          "type": "settlement",
          "regionId": "helios_plateau_5",
          "imagePromptHint": "A view of Helios Post, settlement structure, in Helios Plateau, other environment",
          "population": 496,
          "factionControl": "stellar_directorate_1"
        },
        {
          "id": "helios_camp_9",
          "name": "Helios Camp",
          "type": "settlement",
          "regionId": "helios_plateau_5",
          "imagePromptHint": "A view of Helios Camp, settlement structure, in Helios Plateau, other environment",
          "population": 762,
          "factionControl": "stellar_directorate_1"
        }
      ]
    },
    "factions": [
      {
        "id": "stellar_directorate_1",
        "name": "Stellar Directorate",
        "type": "neutral",
        "power": 30,
        "resources": {
          "food": 45,
          "weapons": 36,
          "mana": 5
        },
        "enemies": [
          "red_dust_initiative_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "quantum_assembly_2",
        "name": "Quantum Assembly",
        "type": "friendly",
        "power": 57,
        "resources": {
          "food": 18,
          "weapons": 43,
          "mana": 36
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "red_dust_initiative_3",
        "name": "Red Dust Initiative",
        "type": "hostile",
        "power": 44,
        "resources": {
          "food": 26,
          "weapons": 34,
          "mana": 15
        },
        "enemies": [
          "stellar_directorate_1"
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
        "id": "npc_vega_1",
        "name": "Vega",
        "role": "quest-giver",
        "locationId": "nova_overlook_5"
      },
      {
        "id": "npc_astra_2",
        "name": "Astra",
        "role": "scout",
        "locationId": "helios_pillar_7",
        "factionId": "quantum_assembly_2"
      },
      {
        "id": "npc_io_3",
        "name": "Io",
        "role": "quest-giver",
        "locationId": "helios_camp_9"
      },
      {
        "id": "npc_reyes_4",
        "name": "Reyes",
        "role": "scholar",
        "locationId": "helios_camp_9",
        "factionId": "quantum_assembly_2"
      },
      {
        "id": "npc_nyx_5",
        "name": "Nyx",
        "role": "quest-giver",
        "locationId": "nova_gate_6"
      },
      {
        "id": "npc_sol_6",
        "name": "Sol",
        "role": "healer",
        "locationId": "helios_pillar_7",
        "factionId": "stellar_directorate_1"
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
          "x": 380,
          "y": 192,
          "dangerLevel": 7,
          "connectedTo": [
            "copper_sprawl_4"
          ],
          "imagePromptHint": "A landscape view of Gaslight Heights, urban environment, steampunk artstyle"
        },
        {
          "id": "iron_docks_2",
          "name": "Iron Docks",
          "type": "urban",
          "biome": "city",
          "x": 556,
          "y": 320,
          "dangerLevel": 7,
          "connectedTo": [
            "copper_sprawl_4",
            "brass_yards_5",
            "steam_quarter_3"
          ],
          "imagePromptHint": "A landscape view of Iron Docks, urban environment, steampunk artstyle",
          "hazard": "toxic"
        },
        {
          "id": "steam_quarter_3",
          "name": "Steam Quarter",
          "type": "mountains",
          "biome": "mountain",
          "x": 706,
          "y": 624,
          "dangerLevel": 6,
          "connectedTo": [
            "iron_docks_2"
          ],
          "imagePromptHint": "A landscape view of Steam Quarter, mountains environment, steampunk artstyle"
        },
        {
          "id": "copper_sprawl_4",
          "name": "Copper Sprawl",
          "type": "urban",
          "biome": "city",
          "x": 553,
          "y": 273,
          "dangerLevel": 3,
          "connectedTo": [
            "gaslight_heights_1",
            "iron_docks_2",
            "brass_yards_5"
          ],
          "imagePromptHint": "A landscape view of Copper Sprawl, urban environment, steampunk artstyle"
        },
        {
          "id": "brass_yards_5",
          "name": "Brass Yards",
          "type": "urban",
          "biome": "city",
          "x": 407,
          "y": 394,
          "dangerLevel": 8,
          "connectedTo": [
            "iron_docks_2",
            "copper_sprawl_4"
          ],
          "imagePromptHint": "A landscape view of Brass Yards, urban environment, steampunk artstyle",
          "hazard": "toxic"
        }
      ],
      "locations": [
        {
          "id": "gaslight_camp_1",
          "name": "Gaslight Camp",
          "type": "settlement",
          "regionId": "gaslight_heights_1",
          "imagePromptHint": "A view of Gaslight Camp, settlement structure, in Gaslight Heights, urban environment",
          "population": 364,
          "factionControl": "gearwright_union_2"
        },
        {
          "id": "iron_place_2",
          "name": "Iron Place",
          "type": "other",
          "regionId": "iron_docks_2",
          "imagePromptHint": "A view of Iron Place, other structure, in Iron Docks, urban environment"
        },
        {
          "id": "steam_monument_3",
          "name": "Steam Monument",
          "type": "landmark",
          "regionId": "steam_quarter_3",
          "imagePromptHint": "A view of Steam Monument, landmark structure, in Steam Quarter, mountains environment",
          "factionControl": "boiler_society_3"
        },
        {
          "id": "copper_camp_4",
          "name": "Copper Camp",
          "type": "settlement",
          "regionId": "copper_sprawl_4",
          "imagePromptHint": "A view of Copper Camp, settlement structure, in Copper Sprawl, urban environment",
          "population": 487,
          "factionControl": "boiler_society_3"
        },
        {
          "id": "copper_pillar_5",
          "name": "Copper Pillar",
          "type": "landmark",
          "regionId": "copper_sprawl_4",
          "imagePromptHint": "A view of Copper Pillar, landmark structure, in Copper Sprawl, urban environment",
          "factionControl": "boiler_society_3"
        },
        {
          "id": "copper_outpost_6",
          "name": "Copper Outpost",
          "type": "settlement",
          "regionId": "copper_sprawl_4",
          "imagePromptHint": "A view of Copper Outpost, settlement structure, in Copper Sprawl, urban environment",
          "population": 175,
          "factionControl": "boiler_society_3"
        },
        {
          "id": "brass_outpost_7",
          "name": "Brass Outpost",
          "type": "settlement",
          "regionId": "brass_yards_5",
          "imagePromptHint": "A view of Brass Outpost, settlement structure, in Brass Yards, urban environment",
          "population": 764,
          "factionControl": "boiler_society_3"
        }
      ]
    },
    "factions": [
      {
        "id": "smokestack_combine_1",
        "name": "Smokestack Combine",
        "type": "neutral",
        "power": 41,
        "resources": {
          "food": 14,
          "weapons": 41,
          "mana": 11
        },
        "enemies": [
          "gearwright_union_2"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "gearwright_union_2",
        "name": "Gearwright Union",
        "type": "hostile",
        "power": 45,
        "resources": {
          "food": 11,
          "weapons": 32,
          "mana": 10
        },
        "enemies": [
          "smokestack_combine_1"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "boiler_society_3",
        "name": "Boiler Society",
        "type": "neutral",
        "power": 64,
        "resources": {
          "food": 16,
          "weapons": 44,
          "mana": 4
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
        "id": "npc_barnaby_1",
        "name": "Barnaby",
        "role": "quest-giver",
        "locationId": "brass_outpost_7",
        "factionId": "boiler_society_3"
      },
      {
        "id": "npc_silas_2",
        "name": "Silas",
        "role": "quest-giver",
        "locationId": "copper_pillar_5",
        "factionId": "boiler_society_3"
      },
      {
        "id": "npc_ada_3",
        "name": "Ada",
        "role": "scout",
        "locationId": "gaslight_camp_1",
        "factionId": "gearwright_union_2"
      },
      {
        "id": "npc_hattie_4",
        "name": "Hattie",
        "role": "quest-giver",
        "locationId": "gaslight_camp_1"
      },
      {
        "id": "npc_beatrix_5",
        "name": "Beatrix",
        "role": "scholar",
        "locationId": "gaslight_camp_1",
        "factionId": "gearwright_union_2"
      },
      {
        "id": "npc_cordelia_6",
        "name": "Cordelia",
        "role": "blacksmith",
        "locationId": "steam_monument_3"
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
          "x": 543,
          "y": 549,
          "dangerLevel": 5,
          "connectedTo": [
            "cyclopean_moor_2",
            "drowned_shore_4"
          ],
          "imagePromptHint": "A landscape view of Pallid Reef, urban environment, cosmic-horror artstyle"
        },
        {
          "id": "cyclopean_moor_2",
          "name": "Cyclopean Moor",
          "type": "urban",
          "biome": "city",
          "x": 503,
          "y": 433,
          "dangerLevel": 5,
          "connectedTo": [
            "pallid_reef_1",
            "whispering_hollow_5",
            "drowned_shore_4"
          ],
          "imagePromptHint": "A landscape view of Cyclopean Moor, urban environment, cosmic-horror artstyle",
          "hazard": "haunted"
        },
        {
          "id": "mist_veiled_vale_3",
          "name": "Mist-veiled Vale",
          "type": "ocean",
          "biome": "sea",
          "x": 820,
          "y": 318,
          "dangerLevel": 2,
          "connectedTo": [
            "whispering_hollow_5"
          ],
          "imagePromptHint": "A landscape view of Mist-veiled Vale, ocean environment, cosmic-horror artstyle"
        },
        {
          "id": "drowned_shore_4",
          "name": "Drowned Shore",
          "type": "ruins",
          "biome": "ruins",
          "x": 358,
          "y": 604,
          "dangerLevel": 3,
          "connectedTo": [
            "pallid_reef_1",
            "cyclopean_moor_2"
          ],
          "imagePromptHint": "A landscape view of Drowned Shore, ruins environment, cosmic-horror artstyle"
        },
        {
          "id": "whispering_hollow_5",
          "name": "Whispering Hollow",
          "type": "wilderness",
          "biome": "swamp",
          "x": 649,
          "y": 329,
          "dangerLevel": 6,
          "connectedTo": [
            "cyclopean_moor_2",
            "mist_veiled_vale_3"
          ],
          "imagePromptHint": "A landscape view of Whispering Hollow, wilderness environment, cosmic-horror artstyle"
        }
      ],
      "locations": [
        {
          "id": "pallid_shrine_1",
          "name": "Pallid Shrine",
          "type": "landmark",
          "regionId": "pallid_reef_1",
          "imagePromptHint": "A view of Pallid Shrine, landmark structure, in Pallid Reef, urban environment",
          "factionControl": "yellow_tide_1"
        },
        {
          "id": "pallid_camp_2",
          "name": "Pallid Camp",
          "type": "settlement",
          "regionId": "pallid_reef_1",
          "imagePromptHint": "A view of Pallid Camp, settlement structure, in Pallid Reef, urban environment",
          "population": 168,
          "factionControl": "yellow_tide_1"
        },
        {
          "id": "cyclopean_camp_3",
          "name": "Cyclopean Camp",
          "type": "settlement",
          "regionId": "cyclopean_moor_2",
          "imagePromptHint": "A view of Cyclopean Camp, settlement structure, in Cyclopean Moor, urban environment",
          "population": 740,
          "factionControl": "hollow_choir_3"
        },
        {
          "id": "cyclopean_town_4",
          "name": "Cyclopean Town",
          "type": "settlement",
          "regionId": "cyclopean_moor_2",
          "imagePromptHint": "A view of Cyclopean Town, settlement structure, in Cyclopean Moor, urban environment",
          "population": 500,
          "factionControl": "hollow_choir_3"
        },
        {
          "id": "cyclopean_village_5",
          "name": "Cyclopean Village",
          "type": "settlement",
          "regionId": "cyclopean_moor_2",
          "imagePromptHint": "A view of Cyclopean Village, settlement structure, in Cyclopean Moor, urban environment",
          "population": 744,
          "factionControl": "hollow_choir_3"
        },
        {
          "id": "mist_veiled_gate_6",
          "name": "Mist-veiled Gate",
          "type": "landmark",
          "regionId": "mist_veiled_vale_3",
          "imagePromptHint": "A view of Mist-veiled Gate, landmark structure, in Mist-veiled Vale, ocean environment",
          "factionControl": "yellow_tide_1"
        },
        {
          "id": "drowned_ridge_7",
          "name": "Drowned Ridge",
          "type": "wilderness",
          "regionId": "drowned_shore_4",
          "imagePromptHint": "A view of Drowned Ridge, wilderness structure, in Drowned Shore, ruins environment"
        },
        {
          "id": "drowned_hollow_8",
          "name": "Drowned Hollow",
          "type": "wilderness",
          "regionId": "drowned_shore_4",
          "imagePromptHint": "A view of Drowned Hollow, wilderness structure, in Drowned Shore, ruins environment"
        },
        {
          "id": "whispering_post_9",
          "name": "Whispering Post",
          "type": "settlement",
          "regionId": "whispering_hollow_5",
          "imagePromptHint": "A view of Whispering Post, settlement structure, in Whispering Hollow, wilderness environment",
          "population": 253,
          "factionControl": "esoteric_lodge_2"
        },
        {
          "id": "whispering_shell_10",
          "name": "Whispering Shell",
          "type": "ruins",
          "regionId": "whispering_hollow_5",
          "imagePromptHint": "A view of Whispering Shell, ruins structure, in Whispering Hollow, wilderness environment"
        },
        {
          "id": "whispering_clearing_11",
          "name": "Whispering Clearing",
          "type": "wilderness",
          "regionId": "whispering_hollow_5",
          "imagePromptHint": "A view of Whispering Clearing, wilderness structure, in Whispering Hollow, wilderness environment"
        }
      ]
    },
    "factions": [
      {
        "id": "yellow_tide_1",
        "name": "Yellow Tide",
        "type": "friendly",
        "power": 62,
        "resources": {
          "food": 27,
          "weapons": 30,
          "mana": 32
        },
        "enemies": [],
        "allies": [
          "esoteric_lodge_2"
        ],
        "goals": []
      },
      {
        "id": "esoteric_lodge_2",
        "name": "Esoteric Lodge",
        "type": "neutral",
        "power": 60,
        "resources": {
          "food": 12,
          "weapons": 13,
          "mana": 29
        },
        "enemies": [],
        "allies": [
          "yellow_tide_1"
        ],
        "goals": []
      },
      {
        "id": "hollow_choir_3",
        "name": "Hollow Choir",
        "type": "neutral",
        "power": 65,
        "resources": {
          "food": 34,
          "weapons": 45,
          "mana": 39
        },
        "enemies": [],
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
        "id": "npc_prudence_1",
        "name": "Prudence",
        "role": "quest-giver",
        "locationId": "whispering_post_9"
      },
      {
        "id": "npc_ophelia_2",
        "name": "Ophelia",
        "role": "scout",
        "locationId": "whispering_post_9",
        "factionId": "esoteric_lodge_2"
      },
      {
        "id": "npc_ward_3",
        "name": "Ward",
        "role": "quest-giver",
        "locationId": "cyclopean_town_4",
        "factionId": "yellow_tide_1"
      },
      {
        "id": "npc_marion_4",
        "name": "Marion",
        "role": "quest-giver",
        "locationId": "whispering_post_9"
      },
      {
        "id": "npc_ezekiel_5",
        "name": "Ezekiel",
        "role": "innkeeper",
        "locationId": "cyclopean_camp_3",
        "factionId": "esoteric_lodge_2"
      },
      {
        "id": "npc_obed_6",
        "name": "Obed",
        "role": "blacksmith",
        "locationId": "mist_veiled_gate_6",
        "factionId": "yellow_tide_1"
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
          "x": 335,
          "y": 524,
          "dangerLevel": 4,
          "connectedTo": [
            "azure_coast_4",
            "plum_blossom_terrace_5",
            "thunder_valley_2"
          ],
          "imagePromptHint": "A landscape view of Crane Forest, mountains environment, oriental-fantasy artstyle"
        },
        {
          "id": "thunder_valley_2",
          "name": "Thunder Valley",
          "type": "wilderness",
          "biome": "plains",
          "x": 624,
          "y": 672,
          "dangerLevel": 3,
          "connectedTo": [
            "crane_forest_1"
          ],
          "imagePromptHint": "A landscape view of Thunder Valley, wilderness environment, oriental-fantasy artstyle"
        },
        {
          "id": "lotus_pass_3",
          "name": "Lotus Pass",
          "type": "mountains",
          "biome": "mountain",
          "x": 37,
          "y": 446,
          "dangerLevel": 7,
          "connectedTo": [
            "azure_coast_4"
          ],
          "imagePromptHint": "A landscape view of Lotus Pass, mountains environment, oriental-fantasy artstyle"
        },
        {
          "id": "azure_coast_4",
          "name": "Azure Coast",
          "type": "mountains",
          "biome": "mountain",
          "x": 201,
          "y": 535,
          "dangerLevel": 8,
          "connectedTo": [
            "crane_forest_1",
            "lotus_pass_3",
            "plum_blossom_terrace_5"
          ],
          "imagePromptHint": "A landscape view of Azure Coast, mountains environment, oriental-fantasy artstyle"
        },
        {
          "id": "plum_blossom_terrace_5",
          "name": "Plum Blossom Terraces",
          "type": "forest",
          "biome": "forest",
          "x": 284,
          "y": 422,
          "dangerLevel": 6,
          "connectedTo": [
            "crane_forest_1",
            "azure_coast_4"
          ],
          "imagePromptHint": "A landscape view of Plum Blossom Terraces, forest environment, oriental-fantasy artstyle"
        }
      ],
      "locations": [
        {
          "id": "crane_hollow_1",
          "name": "Crane Hollow",
          "type": "wilderness",
          "regionId": "crane_forest_1",
          "imagePromptHint": "A view of Crane Hollow, wilderness structure, in Crane Forest, mountains environment"
        },
        {
          "id": "crane_monument_2",
          "name": "Crane Monument",
          "type": "landmark",
          "regionId": "crane_forest_1",
          "imagePromptHint": "A view of Crane Monument, landmark structure, in Crane Forest, mountains environment",
          "factionControl": "silent_guard_3"
        },
        {
          "id": "thunder_village_3",
          "name": "Thunder Village",
          "type": "settlement",
          "regionId": "thunder_valley_2",
          "imagePromptHint": "A view of Thunder Village, settlement structure, in Thunder Valley, wilderness environment",
          "population": 695,
          "factionControl": "white_crane_dynasty_2"
        },
        {
          "id": "lotus_chamber_4",
          "name": "Lotus Chamber",
          "type": "dungeon",
          "regionId": "lotus_pass_3",
          "imagePromptHint": "A view of Lotus Chamber, dungeon structure, in Lotus Pass, mountains environment"
        },
        {
          "id": "lotus_depths_5",
          "name": "Lotus Depths",
          "type": "dungeon",
          "regionId": "lotus_pass_3",
          "imagePromptHint": "A view of Lotus Depths, dungeon structure, in Lotus Pass, mountains environment"
        },
        {
          "id": "lotus_monument_6",
          "name": "Lotus Monument",
          "type": "landmark",
          "regionId": "lotus_pass_3",
          "imagePromptHint": "A view of Lotus Monument, landmark structure, in Lotus Pass, mountains environment",
          "factionControl": "white_crane_dynasty_2"
        },
        {
          "id": "azure_den_7",
          "name": "Azure Den",
          "type": "dungeon",
          "regionId": "azure_coast_4",
          "imagePromptHint": "A view of Azure Den, dungeon structure, in Azure Coast, mountains environment"
        },
        {
          "id": "azure_debris_8",
          "name": "Azure Debris",
          "type": "ruins",
          "regionId": "azure_coast_4",
          "imagePromptHint": "A view of Azure Debris, ruins structure, in Azure Coast, mountains environment"
        },
        {
          "id": "azure_shrine_9",
          "name": "Azure Shrine",
          "type": "landmark",
          "regionId": "azure_coast_4",
          "imagePromptHint": "A view of Azure Shrine, landmark structure, in Azure Coast, mountains environment",
          "factionControl": "lotus_court_1"
        },
        {
          "id": "plum_town_10",
          "name": "Plum Town",
          "type": "settlement",
          "regionId": "plum_blossom_terrace_5",
          "imagePromptHint": "A view of Plum Town, settlement structure, in Plum Blossom Terraces, forest environment",
          "population": 402,
          "factionControl": "white_crane_dynasty_2"
        }
      ]
    },
    "factions": [
      {
        "id": "lotus_court_1",
        "name": "Lotus Court",
        "type": "friendly",
        "power": 74,
        "resources": {
          "food": 40,
          "weapons": 22,
          "mana": 20
        },
        "enemies": [],
        "allies": [],
        "goals": []
      },
      {
        "id": "white_crane_dynasty_2",
        "name": "White Crane Dynasty",
        "type": "neutral",
        "power": 70,
        "resources": {
          "food": 55,
          "weapons": 5,
          "mana": 22
        },
        "enemies": [],
        "allies": [
          "silent_guard_3"
        ],
        "goals": []
      },
      {
        "id": "silent_guard_3",
        "name": "Silent Guard",
        "type": "neutral",
        "power": 40,
        "resources": {
          "food": 39,
          "weapons": 11,
          "mana": 40
        },
        "enemies": [],
        "allies": [
          "white_crane_dynasty_2"
        ],
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
        "id": "npc_mei_1",
        "name": "Mei",
        "role": "quest-giver",
        "locationId": "crane_monument_2"
      },
      {
        "id": "npc_kaede_2",
        "name": "Kaede",
        "role": "innkeeper",
        "locationId": "crane_monument_2",
        "factionId": "white_crane_dynasty_2"
      },
      {
        "id": "npc_haru_3",
        "name": "Haru",
        "role": "guard",
        "locationId": "lotus_monument_6"
      },
      {
        "id": "npc_lian_4",
        "name": "Lian",
        "role": "guard",
        "locationId": "lotus_monument_6"
      },
      {
        "id": "npc_ren_5",
        "name": "Ren",
        "role": "quest-giver",
        "locationId": "thunder_village_3"
      },
      {
        "id": "npc_aki_6",
        "name": "Aki",
        "role": "blacksmith",
        "locationId": "lotus_monument_6"
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
          "x": 523,
          "y": 375,
          "dangerLevel": 6,
          "connectedTo": [
            "west_keep_4",
            "north_wilds_2"
          ],
          "imagePromptHint": "A landscape view of Old Reaches, ruins environment, default artstyle"
        },
        {
          "id": "north_wilds_2",
          "name": "North Wilds",
          "type": "ruins",
          "biome": "ruins",
          "x": 384,
          "y": 276,
          "dangerLevel": 6,
          "connectedTo": [
            "old_reaches_1",
            "west_keep_4"
          ],
          "imagePromptHint": "A landscape view of North Wilds, ruins environment, default artstyle"
        },
        {
          "id": "south_lands_3",
          "name": "South Lands",
          "type": "wilderness",
          "biome": "plains",
          "x": 369,
          "y": 643,
          "dangerLevel": 6,
          "connectedTo": [
            "west_keep_4",
            "high_domain_5"
          ],
          "imagePromptHint": "A landscape view of South Lands, wilderness environment, default artstyle"
        },
        {
          "id": "west_keep_4",
          "name": "West Keep",
          "type": "urban",
          "biome": "city",
          "x": 466,
          "y": 493,
          "dangerLevel": 8,
          "connectedTo": [
            "old_reaches_1",
            "south_lands_3",
            "north_wilds_2"
          ],
          "imagePromptHint": "A landscape view of West Keep, urban environment, default artstyle"
        },
        {
          "id": "high_domain_5",
          "name": "High Domain",
          "type": "wilderness",
          "biome": "plains",
          "x": 410,
          "y": 859,
          "dangerLevel": 7,
          "connectedTo": [
            "south_lands_3"
          ],
          "imagePromptHint": "A landscape view of High Domain, wilderness environment, default artstyle"
        }
      ],
      "locations": [
        {
          "id": "old_pit_1",
          "name": "Old Pit",
          "type": "dungeon",
          "regionId": "old_reaches_1",
          "imagePromptHint": "A view of Old Pit, dungeon structure, in Old Reaches, ruins environment"
        },
        {
          "id": "old_monument_2",
          "name": "Old Monument",
          "type": "landmark",
          "regionId": "old_reaches_1",
          "imagePromptHint": "A view of Old Monument, landmark structure, in Old Reaches, ruins environment",
          "factionControl": "blue_union_1"
        },
        {
          "id": "old_wreckage_3",
          "name": "Old Wreckage",
          "type": "ruins",
          "regionId": "old_reaches_1",
          "imagePromptHint": "A view of Old Wreckage, ruins structure, in Old Reaches, ruins environment"
        },
        {
          "id": "north_ruin_4",
          "name": "North Ruin",
          "type": "landmark",
          "regionId": "north_wilds_2",
          "imagePromptHint": "A view of North Ruin, landmark structure, in North Wilds, ruins environment",
          "factionControl": "gold_circle_3"
        },
        {
          "id": "south_clearing_5",
          "name": "South Clearing",
          "type": "wilderness",
          "regionId": "south_lands_3",
          "imagePromptHint": "A view of South Clearing, wilderness structure, in South Lands, wilderness environment"
        },
        {
          "id": "south_outpost_6",
          "name": "South Outpost",
          "type": "settlement",
          "regionId": "south_lands_3",
          "imagePromptHint": "A view of South Outpost, settlement structure, in South Lands, wilderness environment",
          "population": 512,
          "factionControl": "gold_circle_3"
        },
        {
          "id": "west_point_7",
          "name": "West Point",
          "type": "other",
          "regionId": "west_keep_4",
          "imagePromptHint": "A view of West Point, other structure, in West Keep, urban environment"
        },
        {
          "id": "west_gate_8",
          "name": "West Gate",
          "type": "landmark",
          "regionId": "west_keep_4",
          "imagePromptHint": "A view of West Gate, landmark structure, in West Keep, urban environment",
          "factionControl": "dark_order_2"
        },
        {
          "id": "high_path_9",
          "name": "High Path",
          "type": "wilderness",
          "regionId": "high_domain_5",
          "imagePromptHint": "A view of High Path, wilderness structure, in High Domain, wilderness environment"
        },
        {
          "id": "high_grove_10",
          "name": "High Grove",
          "type": "wilderness",
          "regionId": "high_domain_5",
          "imagePromptHint": "A view of High Grove, wilderness structure, in High Domain, wilderness environment"
        }
      ]
    },
    "factions": [
      {
        "id": "blue_union_1",
        "name": "Blue Union",
        "type": "friendly",
        "power": 69,
        "resources": {
          "food": 57,
          "weapons": 10,
          "mana": 12
        },
        "enemies": [
          "gold_circle_3"
        ],
        "allies": [],
        "goals": []
      },
      {
        "id": "dark_order_2",
        "name": "Dark Order",
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
      },
      {
        "id": "gold_circle_3",
        "name": "Gold Circle",
        "type": "hostile",
        "power": 45,
        "resources": {
          "food": 34,
          "weapons": 33,
          "mana": 15
        },
        "enemies": [
          "blue_union_1"
        ],
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
        "id": "npc_fenn_1",
        "name": "Fenn",
        "role": "quest-giver",
        "locationId": "west_gate_8",
        "factionId": "blue_union_1"
      },
      {
        "id": "npc_holt_2",
        "name": "Holt",
        "role": "healer",
        "locationId": "north_ruin_4",
        "factionId": "blue_union_1"
      },
      {
        "id": "npc_dorn_3",
        "name": "Dorn",
        "role": "healer",
        "locationId": "old_monument_2"
      },
      {
        "id": "npc_irra_4",
        "name": "Irra",
        "role": "scout",
        "locationId": "south_outpost_6",
        "factionId": "dark_order_2"
      },
      {
        "id": "npc_aela_5",
        "name": "Aela",
        "role": "innkeeper",
        "locationId": "north_ruin_4",
        "factionId": "gold_circle_3"
      },
      {
        "id": "npc_ela_6",
        "name": "Ela",
        "role": "merchant",
        "locationId": "south_outpost_6",
        "factionId": "gold_circle_3"
      }
    ]
  }
};
