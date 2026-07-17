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
        
        
        maxBats = configFile.getInt( "maxBats", maxBats );
        maxTicks = configFile.getInt( "maxTicks", maxTicks );
        maxMaggots = configFile.getInt( "maxMaggots", maxMaggots );
        maxSlimes = configFile.getInt( "maxSlimes", maxSlimes );
        maxSkeletons1 = configFile.getInt( "maxSkeletons1", maxSkeletons1 );
        maxSkeletons2 = configFile.getInt( "maxSkeletons2", maxSkeletons2 );
        maxArchers1 = configFile.getInt( "maxArchers1", maxArchers1 );
        maxEyes = configFile.getInt( "maxEyes", maxEyes );
        maxWisps = configFile.getInt( "maxWisps", maxWisps );
        maxArmy = configFile.getInt( "maxArmy", maxArmy );
        maxArmy2 = configFile.getInt( "maxArmy2", maxArmy2 );
        maxArchers2 = configFile.getInt( "maxArchers2", maxArchers2 );
        maxLiches1 = configFile.getInt( "maxLiches1", maxLiches1 );
        maxLiches2 = configFile.getInt( "maxLiches2", maxLiches2 );
        
        monsterCounts = new int[ MonsterType.values().length ];
        monsterCounts[ MonsterType.ARCHER.ordinal() ] = maxArchers1;
        monsterCounts[ MonsterType.ARMY1.ordinal() ] = maxArmy;
        monsterCounts[ MonsterType.ARMY2.ordinal() ] = maxArmy2;
        monsterCounts[ MonsterType.BAT.ordinal() ] = maxBats;
        monsterCounts[ MonsterType.EYE.ordinal() ] = maxEyes;
        monsterCounts[ MonsterType.LICH.ordinal() ] = maxLiches1;
        monsterCounts[ MonsterType.LICH2.ordinal() ] = maxLiches2;
        monsterCounts[ MonsterType.MAGGOT.ordinal() ] = maxMaggots;
        monsterCounts[ MonsterType.SKELETON1.ordinal() ] = maxSkeletons1;
        monsterCounts[ MonsterType.SKELETON2.ordinal() ] = maxSkeletons2;
        monsterCounts[ MonsterType.SLIME.ordinal() ] = maxSlimes;
        monsterCounts[ MonsterType.TICK.ordinal() ] = maxTicks;
        monsterCounts[ MonsterType.WISP.ordinal() ] = maxWisps;
        
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
    
    static int maxBats = 200;
    static int maxTicks = 100;
    static int maxMaggots = 80;
    static int maxSlimes = 300;
    static int maxSkeletons1 = 100;
    static int maxSkeletons2 = 80;
    static int maxArchers1 = 40;
    static int maxEyes = 50;
    static int maxWisps = 25;
    static int maxArmy = 70;
    static int maxArmy2 = 50;
    static int maxArchers2 = 30;
    static int maxLiches1 = 20;
    static int maxLiches2 = 10;
    static int[] monsterCounts;
    
    static String[][] levelMonsters =
    { 
        { MonsterType.BAT.plainString, MonsterType.TICK.plainString, MonsterType.MAGGOT.plainString },
        { MonsterType.BAT.plainString, MonsterType.TICK.plainString, MonsterType.SLIME.plainString, MonsterType.MAGGOT.plainString },
        { MonsterType.SLIME.plainString, MonsterType.SKELETON1.plainString, MonsterType.MAGGOT.plainString },
        { MonsterType.EYE.plainString, MonsterType.SKELETON1.plainString, MonsterType.ARCHER.plainString, MonsterType.ARCHER.plainString  },
        { MonsterType.WISP.plainString, MonsterType.SKELETON1.plainString, MonsterType.ARCHER.plainString, MonsterType.EYE.plainString, MonsterType.ARMY1.plainString }, 
        { MonsterType.SKELETON1.plainString, MonsterType.ARCHER.plainString, MonsterType.ARMY1.plainString, MonsterType.SKELETON2.plainString, MonsterType.WISP.plainString }, 
        { MonsterType.SKELETON2.plainString, MonsterType.ARCHER.plainString, MonsterType.LICH.plainString, MonsterType.ARMY1.plainString },
        { MonsterType.SKELETON2.plainString, MonsterType.ARMY2.plainString, MonsterType.LICH2.plainString },
    };
    
}
