package hammerwatchgen;

import java.util.ArrayList;

public class Monster extends XMLObject {

    public static ArrayList<Monster> monsters = new ArrayList<>();
    
    static final String[] archers1 = 
    	{ "actors/spawners/archer_1.xml",
    	"actors/archer_1.xml",
    	"actors/archer_1_elite.xml" };
    
    static final String[] archers2 = 
        { "actors/spawners/archer_2.xml",
          "actors/archer_2.xml" };
    
    static final String[] archers3 = 
        { "actors/archer_3.xml" };
    
    static final String[] bats1 = 
	    { "actors/spawners/bats.xml",
	      "actors/bat_1.xml", 
	      "actors/bat_2.xml" };
    
    static final String[] bats2 = 
        { "actors/spawners/bats.xml",
          "actors/bat_2.xml", 
          "actors/bat_3.xml" };  
    
    static final String[] eyes = 
	    { "actors/spawners/eye_1.xml",
	      "actors/eye_1_small.xml",
	      "actors/eye_1.xml" };
    
    static final String[] floater_fires = 
    	{ "actors/floater_fire.xml" };  
    
    static final String[] guards_desert = 
        { "actors/npc_guard_desert_1.xml" };  
    
    static final String[] guards_desert_range = 
    	{ "actors/guard_desert_1.xml" };  
    
    static final String[] liches = 
	    { "actors/lich_1.xml",
	      "actors/lich_1_elite.xml",
	      "actors/lich_2.xml",
	      "actors/lich_3.xml" };
    
    static final String[] liches_desert = 
	    { "actors/lich_desert_1.xml",
	       "actors/lich_desert_2.xml",
	       "actors/lich_desert_3.xml" };
    
    static final String[] maggots = 
	    { "actors/spawners/maggot_1.xml",
	      "actors/maggot_1_small.xml",
	      "actors/maggot_1.xml",
	      "actors/maggot_1_elite.xml" };
    
    static final String[] mummies = 
        { "actors/spawners/mummy_1.xml",
    	  "actors/mummy_1.xml",
    	  "actors/mummy_1_small.xml",
    	  "actors/mummy_1_elite.xml" };  
    
    static final String[] mummies_ranged = 
        { "actors/spawners/mummy_ranged_1.xml",
    	  "actors/mummy_ranged_1.xml",
    	  "actors/mummy_ranged_2.xml"};  
    
    static final String[] pillar_fires = 
        { "actors/pillar_fire.xml" };  
    
    static final String[] skeletons1 = 
	    { "actors/spawners/skeleton_1.xml",
	      "actors/skeleton_1_small.xml",
	      "actors/skeleton_1.xml",
	      "actors/skeleton_1_elite.xml" };
    
    static final String[] skeletons2 = 
	    { "actors/spawners/skeleton_2.xml",
	      "actors/skeleton_2_small.xml",
	      "actors/skeleton_2.xml",
	      "actors/skeleton_2_elite.xml" };
    
    static final String[] slimes = 
	    { "actors/slime_1_host.xml",
	      "actors/slime_1_spawn.xml" };
    
    static final String[] special_beheaded_kamikazes = 
        { "actors/special_beheaded_kamikaze.xml" };
    
    static final String[] spiders = 
        { "actors/spider_1.xml" };  
    
    static final String[] ticks1 = 
	    { "actors/spawners/tick_1.xml",
	      "actors/tick_1_small.xml",
	      "actors/tick_1.xml",
	      "actors/tick_1_elite.xml" };
    
    static final String[] ticks2 = 
        { "actors/tick_2_small.xml",
          "actors/tick_2.xml" };
    
    static final String[] towers_banner1 = 
        { "actors/tower_banner_1.xml" };
    
    static final String[] towers_banner2 = 
        { "actors/tower_banner_2.xml" };
    
    static final String[] towers_banner3 = 
        { "actors/tower_banner_3.xml" };
    
    static final String[] towers_archer1 = 
        { "actors/tower_battlement_archer_1.xml" };
    
    static final String[] towers_archer2 = 
        { "actors/tower_battlement_archer_2.xml" };
    
    static final String[] towers_archer3 = 
        { "actors/tower_battlement_archer_3.xml" };
    
    static final String[] towers_flower1 = 
        { "actors/tower_flower_1.xml" };
    
    static final String[] towers_flower1_small = 
        { "actors/tower_flower_1_small.xml" };
    
    static final String[] towers_flower2 = 
        { "actors/tower_flower_2.xml" };
    
    static final String[] towers_flower3 = 
        { "actors/tower_flower_3.xml" };
    
    static final String[] towers_nova1 = 
        { "actors/tower_nova_1.xml" };
    
    static final String[] towers_nova2 = 
        { "actors/tower_nova_2.xml" };
    
    static final String[] towers_static_frost = 
        { "actors/tower_static_frost.xml" };
    
    static final String[] towers_tracking1 = 
        { "actors/tower_tracking_1.xml" };
    
    static final String[] towers_tracking2 = 
        { "actors/tower_tracking_2.xml" };
    
    static final String[] towers_tracking3 = 
        { "actors/tower_tracking_3.xml" };
    
    static final String[] wisps1 = 
	    { "actors/spawners/wisp_1.xml",
	      "actors/wisp_1_small.xml",
	      "actors/wisp_1.xml" };   
    
    static final String[] wisps2 = 
        { "actors/wisp_2.xml" };
    
    static final String[] mb_doomspawns = 
    	{ "actors/spawners/doomspawn_1.xml" };
    
    static final String[] mb_eyes = 
        { "actors/eye_1_mb.xml" };
    
    static final String[] mb_liches = 
        { "actors/lich_1_mb.xml" };
    
    static final String[] mb_maggots = 
    	{ "actors/maggot_1_mb.xml" };
    
    static final String[] mb_mummies = 
    	{ "actors/mummy_1_mb.xml" };
    
    static final String[] mb_skeletons = 
    	{ "actors/skeleton_1_mb.xml" };
    
    static final String[] mb_ticks = 
    	{ "actors/tick_1_mb.xml" };
    
    public enum MonsterType {
    	
    	ARCHER1( archers1, 1.0f, "archer1" ),
    	ARCHER2( archers2, 1.0f, "archer2" ),
    	ARCHER3( archers3, 1.0f, "archer3" ),
        BAT1( bats1, 1.0f, "bat1" ),
        BAT2( bats2, 1.0f, "bat2" ),
        EYE( eyes, 1.0f, "eye" ),
        FLOATER_FIRE( floater_fires, 1.0f, "floater_fire" ),
        GUARD_DESERT( guards_desert, 1.0f, "guard_desert" ),
        GUARD_DESERT_RANGE( guards_desert_range, 1.0f, "guard_desert_range" ),
        LICH( liches, 1.0f, "lich" ),
        LICH_DESERT( liches_desert, 1.0f, "lich_desert" ),
        MAGGOT( maggots, 1.0f, "maggot" ),
        MUMMY( mummies, 1.0f, "mummy_desert" ),
        MUMMY_RANGED( mummies_ranged, 1.0f, "mummy_ranged" ),
        PILLAR_FIRE( pillar_fires, 1.0f, "pillar_fire" ),
        SKELETON1( skeletons1, 1.0f, "skeleton1"),
        SKELETON2( skeletons2, 1.0f, "skeleton2" ),
        SLIME( slimes, 1.0f, "slime" ),
        SPECIAL_BEHEADED_KAMIKAZE( special_beheaded_kamikazes, 1.0f, "special_beheaded_kamikaze" ),
        SPIDER( spiders, 1.0f, "spider" ),
        TICK1( ticks1, 1.0f, "tick1" ),
        TICK2( ticks2, 1.0f, "tick2" ),
        TOWER_BANNER1( towers_banner1, 1.0f, "tower_banner1" ),
        TOWER_BANNER2( towers_banner2, 1.0f, "tower_banner2" ),
        TOWER_BANNER3( towers_banner3, 1.0f, "tower_banner3" ),
        TOWER_ARCHER1( towers_archer1, 1.0f, "tower_archer1" ),
        TOWER_ARCHER2( towers_archer2, 1.0f, "tower_archer2" ),
        TOWER_ARCHER3( towers_archer3, 1.0f, "tower_archer3" ),
        TOWER_FLOWER1( towers_flower1, 1.0f, "tower_flower1" ),
        TOWER_FLOWER1_SMALL( towers_flower1_small, 1.0f, "tower_flower1_small" ),
        TOWER_FLOWER2( towers_flower2, 1.0f, "tower_flower2" ),
        TOWER_FLOWER3( towers_flower3, 1.0f, "tower_flower3" ),
        TOWER_NOVA1( towers_nova1, 1.0f, "tower_nova1" ),
        TOWER_NOVA2( towers_nova2, 1.0f, "tower_nova2" ),
        TOWER_STATIC_FROST( towers_static_frost, 1.0f, "tower_static_frost" ),
        TOWER_TRACKING1( towers_tracking1, 1.0f, "tower_tracking1" ),
        TOWER_TRACKING2( towers_tracking2, 1.0f, "tower_tracking2" ),
        TOWER_TRACKING3( towers_tracking3, 1.0f, "tower_tracking3" ),
        WISP1( wisps1, 1.0f, "wisp1"),
        WISP2( wisps2, 1.0f, "wisp2"),
        MB_DOOMSPAWN( mb_doomspawns, 1.0f, "mb_doomspawn" ),
        MB_EYE( mb_eyes, 1.0f, "mb_eye" ),
        MB_LICH( mb_liches, 1.0f, "mb_lich" ),
        MB_MAGGOT( mb_maggots, 1.0f, "mb_maggot" ),
        MB_MUMMY( mb_mummies, 1.0f, "mb_mummy" ),
        MB_SKELETON( mb_skeletons, 1.0f, "mb_skeleton" ),
        MB_TICK( mb_ticks, 1.0f, "mb_tick" );
        
    	/*ARCHER1( archers1, 0.2f, "archer1" ),
    	ARCHER2( archers2, 0.2f, "archer2" ),
    	ARCHER3( archers3, 0.2f, "archer3" ),
        BAT1( bats1, 0.3f, "bat1" ),
        BAT2( bats2, 0.3f, "bat2" ),
        EYE( eyes, 0.4f, "eye" ),
        FLOATER_FIRE( floater_fires, 0.4f, "floater_fire" ),
        GUARD_DESERT( guards_desert, 0.3f, "guard_desert" ),
        GUARD_DESERT_RANGE( guards_desert_range, 0.2f, "guard_desert_range" ),
        LICH( liches, 0.2f, "lich" ),
        LICH2( liches, 0.5f, "lich2"),
        LICH_DESERT( liches_desert, 0.2f, "lich_desert" ),
        LICH2_DESERT( liches_desert, 0.5f, "lich2_desert"),
        MAGGOT( maggots, 0.2f, "maggot" ),
        MUMMY( mummies, 0.3f, "mummy_desert" ),
        MUMMY_RANGED( mummies_ranged, 0.2f, "mummy_ranged" ),
        PILLAR_FIRE( pillar_fires, 0.4f, "pillar_fire" ),
        SKELETON1( skeletons1, 0.3f, "skeleton1"),
        SKELETON2( skeletons2, 0.3f, "skeleton2" ),
        SLIME( slimes, 0.3f, "slime" ),
        SPECIAL_BEHEADED_KAMIKAZE( special_beheaded_kamikazes, 0.4f, "special_beheaded_kamikaze" ),
        TICK1( ticks1, 0.3f, "tick1" ),
        TICK2( ticks2, 0.3f, "tick2" ),
        TOWER_BANNER1( towers_banner1, 0.3f, "tower_banner1" ),
        TOWER_BANNER2( towers_banner2, 0.3f, "tower_banner2" ),
        TOWER_BANNER3( towers_banner3, 0.3f, "tower_banner3" ),
        TOWER_ARCHER1( towers_archer1, 0.2f, "tower_archer1" ),
        TOWER_ARCHER2( towers_archer2, 0.2f, "tower_archer2" ),
        TOWER_ARCHER3( towers_archer3, 0.2f, "tower_archer3" ),
        TOWER_FLOWER1( towers_flower1, 0.2f, "tower_flower1" ),
        TOWER_FLOWER1_SMALL( towers_flower1_small, 0.2f, "tower_flower1_small" ),
        TOWER_FLOWER2( towers_flower2, 0.2f, "tower_flower2" ),
        TOWER_FLOWER3( towers_flower3, 0.2f, "tower_flower3" ),
        TOWER_NOVA1( towers_nova1, 0.2f, "tower_nova1" ),
        TOWER_NOVA2( towers_nova2, 0.2f, "tower_nova2" ),
        TOWER_STATIC_FROST( towers_static_frost, 0.2f, "tower_static_frost" ),
        TOWER_TRACKING1( towers_tracking1, 0.2f, "tower_tracking1" ),
        TOWER_TRACKING2( towers_tracking2, 0.2f, "tower_tracking2" ),
        TOWER_TRACKING3( towers_tracking3, 0.2f, "tower_tracking3" ),
        WISP1( wisps1, 0.5f, "wisp1"),
        WISP2( wisps2, 0.5f, "wisp2"),
        MB_DOOMSPAWN( mb_doomspawns, 1.0f, "mb_doomspawn" ),
        MB_EYE( mb_eyes, 1.0f, "mb_eye" ),
        MB_LICH( mb_liches, 1.0f, "mb_lich" ),
        MB_MAGGOT( mb_maggots, 1.0f, "mb_maggot" ),
        MB_MUMMY( mb_mummies, 1.0f, "mb_mummy" ),
        MB_SKELETON( mb_skeletons, 1.0f, "mb_skeleton" ),
        MB_TICK( mb_ticks, 1.0f, "mb_tick" );*/
        
        public XMLString[] xmlStrings;
        float upgradeChance;
        String plainString;
        MonsterType( String[] names, float chance, String plain ) {
            
            plainString = plain;
            this.upgradeChance = chance;
            xmlStrings = new XMLString[ names.length ];
            for( int i = 0; i < names.length; i++ ) {
                xmlStrings[i] = new XMLString( "type", names[i] );
                }
        }
    }
    
    int tier;
    MonsterType type;
    float x;
    float y;
    int id;
    
    static public MonsterType chooseMonsterForLevel( int level ) {
        
        return parseString( Parameters.levelMonsters[ level ][ Rand.iRand(0, Parameters.levelMonsters[ level ].length ) ] );
    }
    
    static public MonsterType parseString( String monsterName ) {
        
        for( MonsterType t : MonsterType.values() ) {
            
            if( t.plainString.equals( monsterName ) ) {
                
                return t;
            }
        }
        return MonsterType.BAT1;
    }
    
    public static void Clear() {
        
        monsters.clear();
    }
    static public Monster Create( float x, float y, MonsterType type, int tier ) {
        
        Monster m = new Monster( x, y, type, tier );
        monsters.add( m );
        return m;
    }
    
    static public Monster Create( float x, float y, MonsterType type ) {
        
        // determine tier
        int tier = 1;
        while( Rand.fRand(0, 1) < type.upgradeChance && tier < type.xmlStrings.length - 1 ) {
            
            tier++;
        }
        Monster m = new Monster( x, y, type, tier );
        monsters.add( m );
        return m;
    }
    
    static public void Delete( Monster m ) {
        
        monsters.remove( m );
    }
    
    Monster( float x, float y, MonsterType type, int tier ) {
        
        id = Level.idCounter++;
        this.x = x;
        this.y = y;
        this.type = type;
        this.tier = tier;
    }
    
    public String getXML() {
        
        // create XML structure
        XMLInt idInt = new XMLInt( "id", id );
        XMLString typeString = type.xmlStrings[ tier ];
        XMLFloat xFloat = new XMLFloat( "x", x );
        XMLFloat yFloat = new XMLFloat( "y", y );
        
        XMLDictionary actorsDict = new XMLDictionary( "" );
        actorsDict.addData(idInt);
        actorsDict.addData(typeString);
        actorsDict.addData(xFloat);
        actorsDict.addData(yFloat);
        
        return actorsDict.getXML();
    }
    
}
