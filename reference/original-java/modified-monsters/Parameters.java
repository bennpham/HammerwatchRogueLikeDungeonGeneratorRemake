package hammerwatchgen;

import hammerwatchgen.Monster.MonsterType;

/*-----------------------------------------------------
Sizes are in units of tiles   
----------------------------------------------------*/
public class Parameters {
    
    public static ConfigFile configFile = new ConfigFile( "parameters.txt" );
    
    public static void init() {
    
        path = configFile.getString( "path", path );
        levels = configFile.getInt( "levels", levels );
        minRoomSize = configFile.getInt( "minRoomSize", minRoomSize );
        maxRoomSize = configFile.getInt( "maxRoomSize", maxRoomSize );
        minPassageWidth = configFile.getInt( "minPassageWidth", minPassageWidth );
        maxPassageWidth = configFile.getInt( "maxPassageWidth", maxPassageWidth );
        minRoomCount = configFile.getInt( "minRoomCount", minRoomCount );
        maxRoomCount = configFile.getInt( "maxRoomCount", maxRoomCount );
        mapWidth = configFile.getInt( "mapWidth", mapWidth );
        mapHeight = configFile.getInt( "mapHeight", mapHeight );
        edgePadding = configFile.getInt( "edgePadding", edgePadding );
        roomPadding = configFile.getInt( "roomPadding", roomPadding );
        cleanupFiles = configFile.getInt( "cleanupFiles", cleanupFiles );
        themes = configFile.getStringArray( "themes", themes );
        monsterMultiplier = configFile.getFloat( "monsterMultiplier", monsterMultiplier );
        goldMultiplier = configFile.getFloat( "goldMultiplier", goldMultiplier );
        foodMultiplier = configFile.getFloat( "foodMultiplier", foodMultiplier );
        shopChance = configFile.getFloat( "shopChance", shopChance );
        vaultChance = configFile.getFloat( "vaultChance", vaultChance );
        lockChance = configFile.getFloat( "lockChance", lockChance );
        keyChance = configFile.getFloat( "keyChance", keyChance );
        
        String[][] newMonsterStrings = new String[levels][];
        for( int i = 0; i < levels; i++ ) {
            newMonsterStrings[i] = configFile.getStringArray( "monsters" + i, levelMonsters[i] );
        }
        levelMonsters = newMonsterStrings;
        
        maxArchers1 = configFile.getInt( "maxArchers1", maxArchers1 );
        maxArchers2 = configFile.getInt( "maxArchers2", maxArchers2 );
        maxArchers3 = configFile.getInt( "maxArchers3", maxArchers3 );
        maxBats1 = configFile.getInt( "maxBats1", maxBats1 );
        maxBats2 = configFile.getInt( "maxBats2", maxBats2 );
        maxEyes = configFile.getInt( "maxEyes", maxEyes );
        maxFloater_Fires = configFile.getInt( "maxFloater_Fires", maxFloater_Fires );
        maxGuards_Desert = configFile.getInt( "maxGuards_Desert", maxGuards_Desert );
        maxGuards_Desert_Range = configFile.getInt( "maxGuards_Desert_Range", maxGuards_Desert_Range );
        maxLiches = configFile.getInt( "maxLiches", maxLiches );
        maxLiches_Desert = configFile.getInt( "maxLiches_Desert", maxLiches_Desert );
        maxMaggots = configFile.getInt( "maxMaggots", maxMaggots );
        maxMummies = configFile.getInt( "maxMummies", maxMummies );
        maxMummies_Ranged = configFile.getInt( "maxMummies_Ranged", maxMummies_Ranged );
        maxPillar_Fires = configFile.getInt( "maxPillar_Fires", maxPillar_Fires );
        maxSkeletons1 = configFile.getInt( "maxSkeletons1", maxSkeletons1 );
        maxSkeletons2 = configFile.getInt( "maxSkeletons2", maxSkeletons2 );
        maxSlimes = configFile.getInt( "maxSlimes", maxSlimes );
        maxSpecial_Beheaded_Kamikazes = configFile.getInt( "maxSpecial_Beheaded_Kamikazes", maxSpecial_Beheaded_Kamikazes );
        maxSpiders = configFile.getInt( "maxSpiders", maxSpiders );
        maxTicks1 = configFile.getInt( "maxTicks1", maxTicks1 );
        maxTicks2 = configFile.getInt( "maxTicks2", maxTicks2 );
        maxTowers_Banner1 = configFile.getInt( "maxTowers_Banner1", maxTowers_Banner1 );
        maxTowers_Banner2 = configFile.getInt( "maxTowers_Banner2", maxTowers_Banner2 );
        maxTowers_Banner3 = configFile.getInt( "maxTowers_Banner3", maxTowers_Banner3 );
        maxTowers_Archer1 = configFile.getInt( "maxTowers_Archer1", maxTowers_Archer1 );
        maxTowers_Archer2 = configFile.getInt( "maxTowers_Archer2", maxTowers_Archer2 );
        maxTowers_Archer3 = configFile.getInt( "maxTowers_Archer3", maxTowers_Archer3 );
        maxTowers_Flower1 = configFile.getInt( "maxTowers_Flower1", maxTowers_Flower1 );
        maxTowers_Flower1_Small = configFile.getInt( "maxTowers_Flower1_Small", maxTowers_Flower1_Small );
        maxTowers_Flower2 = configFile.getInt( "maxTowers_Flower2", maxTowers_Flower2 );
        maxTowers_Flower3 = configFile.getInt( "maxTowers_Flower3", maxTowers_Flower3 );
        maxTowers_Nova1 = configFile.getInt( "maxTowers_Nova1", maxTowers_Nova1 );
        maxTowers_Nova2 = configFile.getInt( "maxTowers_Nova2", maxTowers_Nova2 );
        maxTowers_Static_Frost = configFile.getInt( "maxTowers_Static_Frost", maxTowers_Static_Frost );
        maxTowers_Tracking1 = configFile.getInt( "maxTowers_Tracking1", maxTowers_Tracking1 );
        maxTowers_Tracking2 = configFile.getInt( "maxTowers_Tracking2", maxTowers_Tracking2 );
        maxTowers_Tracking3 = configFile.getInt( "maxTowers_Tracking3", maxTowers_Tracking3 );
        maxWisps1 = configFile.getInt( "maxWisps1", maxWisps1 );
        maxWisps2 = configFile.getInt( "maxWisps2", maxWisps2 );
        maxMB_Doomspawns = configFile.getInt( "maxMB_Doomspawns", maxMB_Doomspawns );
        maxMB_Eyes = configFile.getInt( "maxMB_Eyes", maxMB_Eyes );
        maxMB_Liches = configFile.getInt( "maxMB_Liches", maxMB_Liches );
        maxMB_Maggots = configFile.getInt( "maxMB_Maggots", maxMB_Maggots );
        maxMB_Mummies = configFile.getInt( "maxMB_Mummies", maxMB_Mummies );
        maxMB_Skeletons = configFile.getInt( "maxMB_Skeletons", maxMB_Skeletons );
        maxMB_Ticks = configFile.getInt( "maxMB_Ticks", maxMB_Ticks );
        
        monsterCounts = new int[ MonsterType.values().length ];
        monsterCounts[ MonsterType.ARCHER1.ordinal() ] = maxArchers1;
        monsterCounts[ MonsterType.ARCHER2.ordinal() ] = maxArchers2;
        monsterCounts[ MonsterType.ARCHER3.ordinal() ] = maxArchers3;
        monsterCounts[ MonsterType.BAT1.ordinal() ] = maxBats1;
        monsterCounts[ MonsterType.BAT2.ordinal() ] = maxBats2;
        monsterCounts[ MonsterType.EYE.ordinal() ] = maxEyes;
        monsterCounts[ MonsterType.FLOATER_FIRE.ordinal() ] = maxFloater_Fires;
        monsterCounts[ MonsterType.GUARD_DESERT.ordinal() ] = maxGuards_Desert;
        monsterCounts[ MonsterType.GUARD_DESERT_RANGE.ordinal() ] = maxGuards_Desert_Range;
        monsterCounts[ MonsterType.LICH.ordinal() ] = maxLiches;
        monsterCounts[ MonsterType.LICH_DESERT.ordinal() ] = maxLiches_Desert;
        monsterCounts[ MonsterType.MAGGOT.ordinal() ] = maxMaggots;
        monsterCounts[ MonsterType.MUMMY.ordinal() ] = maxMummies;
        monsterCounts[ MonsterType.MUMMY_RANGED.ordinal() ] = maxMummies_Ranged;
        monsterCounts[ MonsterType.PILLAR_FIRE.ordinal() ] = maxPillar_Fires;
        monsterCounts[ MonsterType.SKELETON1.ordinal() ] = maxSkeletons1;
        monsterCounts[ MonsterType.SKELETON2.ordinal() ] = maxSkeletons2;
        monsterCounts[ MonsterType.SLIME.ordinal() ] = maxSlimes;
        monsterCounts[ MonsterType.SPECIAL_BEHEADED_KAMIKAZE.ordinal() ] = maxSpecial_Beheaded_Kamikazes;
        monsterCounts[ MonsterType.SPIDER.ordinal() ] = maxSpiders;
        monsterCounts[ MonsterType.TICK1.ordinal() ] = maxTicks1;
        monsterCounts[ MonsterType.TICK2.ordinal() ] = maxTicks2;
        monsterCounts[ MonsterType.TOWER_BANNER1.ordinal() ] = maxTowers_Banner1;
        monsterCounts[ MonsterType.TOWER_BANNER2.ordinal() ] = maxTowers_Banner2;
        monsterCounts[ MonsterType.TOWER_BANNER3.ordinal() ] = maxTowers_Banner3;
        monsterCounts[ MonsterType.TOWER_ARCHER1.ordinal() ] = maxTowers_Archer1;
        monsterCounts[ MonsterType.TOWER_ARCHER2.ordinal() ] = maxTowers_Archer2;
        monsterCounts[ MonsterType.TOWER_ARCHER3.ordinal() ] = maxTowers_Archer3;
        monsterCounts[ MonsterType.TOWER_FLOWER1.ordinal() ] = maxTowers_Flower1;
        monsterCounts[ MonsterType.TOWER_FLOWER1_SMALL.ordinal() ] = maxTowers_Flower1_Small;
        monsterCounts[ MonsterType.TOWER_FLOWER2.ordinal() ] = maxTowers_Flower2;
        monsterCounts[ MonsterType.TOWER_FLOWER3.ordinal() ] = maxTowers_Flower3;
        monsterCounts[ MonsterType.TOWER_NOVA1.ordinal() ] = maxTowers_Nova1;
        monsterCounts[ MonsterType.TOWER_NOVA2.ordinal() ] = maxTowers_Nova2;
        monsterCounts[ MonsterType.TOWER_STATIC_FROST.ordinal() ] = maxTowers_Static_Frost;
        monsterCounts[ MonsterType.TOWER_TRACKING1.ordinal() ] = maxTowers_Tracking1;
        monsterCounts[ MonsterType.TOWER_TRACKING2.ordinal() ] = maxTowers_Tracking2;
        monsterCounts[ MonsterType.TOWER_TRACKING3.ordinal() ] = maxTowers_Tracking3;
        monsterCounts[ MonsterType.WISP1.ordinal() ] = maxWisps1;
        monsterCounts[ MonsterType.WISP2.ordinal() ] = maxWisps2;
        monsterCounts[ MonsterType.MB_DOOMSPAWN.ordinal() ] = maxMB_Doomspawns;
        monsterCounts[ MonsterType.MB_EYE.ordinal() ] = maxMB_Eyes;
        monsterCounts[ MonsterType.MB_LICH.ordinal() ] = maxMB_Liches;
        monsterCounts[ MonsterType.MB_MAGGOT.ordinal() ] = maxMB_Maggots;
        monsterCounts[ MonsterType.MB_MUMMY.ordinal() ] = maxMB_Mummies;
        monsterCounts[ MonsterType.MB_SKELETON.ordinal() ] = maxMB_Skeletons;
        monsterCounts[ MonsterType.MB_TICK.ordinal() ] = maxMB_Ticks;
        
        configFile.save();
    }
    
    // default values
    static String path = "C:/Program Files (x86)/Steam/steamapps/common/Hammerwatch";
    static int levels = 8;
    static int minRoomSize = 6;
    static int maxRoomSize = 20;
    static int minPassageWidth = 3;
    static int maxPassageWidth = 6;
    static int minRoomCount = 12;
    static int maxRoomCount = 15;
    static int mapWidth = 80; // use multiples of 20
    static int mapHeight = 60;
    static int edgePadding = 2;
    static int roomPadding = 2;
    static String[] themes = { "a", "a", "b", "b", "c", "c", "d", "d" };
    static float monsterMultiplier = 1.0f;
    static float goldMultiplier = 1.1f;
    static float foodMultiplier = 1.2f;
    static float shopChance = 1.0f;
    static float vaultChance = 0.3f;
    static float lockChance = 0.8f;
    static float keyChance = 1.0f;
    static int cleanupFiles = 1;
    
    static int maxArchers1 = 40;
    static int maxArchers2 = 30;
    static int maxArchers3 = 0;
    static int maxBats1 = 200;
    static int maxBats2 = 0;
    static int maxEyes = 50;
    static int maxFloater_Fires = 0;
    static int maxGuards_Desert = 0;
    static int maxGuards_Desert_Range = 0;
    static int maxLiches = 30;
    static int maxLiches_Desert = 0;
    static int maxMaggots = 80;
    static int maxMummies = 0;
    static int maxMummies_Ranged = 0;
    static int maxPillar_Fires = 0;
    static int maxSkeletons1 = 100;
    static int maxSkeletons2 = 80;
    static int maxSlimes = 300;
    static int maxSpecial_Beheaded_Kamikazes = 0;
    static int maxSpiders = 0;
    static int maxTicks1 = 100;
    static int maxTicks2 = 0;
    static int maxTowers_Banner1 = 0;
    static int maxTowers_Banner2 = 0;
    static int maxTowers_Banner3 = 0;
    static int maxTowers_Archer1 = 0;
    static int maxTowers_Archer2 = 0;
    static int maxTowers_Archer3 = 0;
    static int maxTowers_Flower1 = 0;
    static int maxTowers_Flower1_Small = 0;
    static int maxTowers_Flower2 = 0;
    static int maxTowers_Flower3 = 0;
    static int maxTowers_Nova1 = 0;
    static int maxTowers_Nova2 = 0;
    static int maxTowers_Static_Frost = 0;
    static int maxTowers_Tracking1 = 0;
    static int maxTowers_Tracking2 = 0;
    static int maxTowers_Tracking3 = 0;
    static int maxWisps1 = 25;
    static int maxWisps2 = 0;
    static int maxMB_Doomspawns = 0;
    static int maxMB_Eyes = 0;
    static int maxMB_Liches = 0;
    static int maxMB_Maggots = 0;
    static int maxMB_Mummies = 0;
    static int maxMB_Skeletons = 0;
    static int maxMB_Ticks = 0;
    static int[] monsterCounts;
    
    static String[][] levelMonsters =
    { 
        { MonsterType.BAT1.plainString, MonsterType.TICK1.plainString, MonsterType.MAGGOT.plainString },
        { MonsterType.BAT1.plainString, MonsterType.TICK1.plainString, MonsterType.SLIME.plainString, MonsterType.MAGGOT.plainString },
        { MonsterType.SLIME.plainString, MonsterType.SKELETON1.plainString, MonsterType.MAGGOT.plainString },
        { MonsterType.EYE.plainString, MonsterType.SKELETON1.plainString, MonsterType.ARCHER1.plainString, MonsterType.ARCHER2.plainString  },
        { MonsterType.WISP1.plainString, MonsterType.SKELETON1.plainString, MonsterType.ARCHER2.plainString, MonsterType.EYE.plainString }, 
        { MonsterType.SKELETON1.plainString, MonsterType.ARCHER2.plainString, MonsterType.SKELETON2.plainString, MonsterType.WISP1.plainString }, 
        { MonsterType.SKELETON2.plainString, MonsterType.ARCHER2.plainString, MonsterType.LICH.plainString },
        { MonsterType.SKELETON2.plainString, MonsterType.LICH.plainString },
    };
    
}
