package hammerwatchgen;

import java.util.ArrayList;

public class Monster extends XMLObject {

    public static ArrayList<Monster> monsters = new ArrayList<>();
    
    static final String[] bats = 
    { "actors/spawners/bats.xml",
      "actors/bat_1.xml", 
      "actors/bat_2.xml" };
    
    static final String[] ticks = 
    { "actors/spawners/tick_1.xml",
      "actors/tick_1_small.xml",
      "actors/tick_1.xml",
      "actors/tick_1_elite.xml" };
    
    static final String[] maggots = 
    { "actors/spawners/maggot_1.xml",
      "actors/maggot_1_small.xml",
      "actors/maggot_1.xml",
      "actors/maggot_1_elite.xml" };
    
    static final String[] eyes = 
    { "actors/spawners/eye_1.xml",
      "actors/eye_1_small.xml",
      "actors/eye_1.xml" };
    
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
    
    static final String[] army1 = 
    { "actors/spawners/skeleton_2.xml",
      "actors/skeleton_1.xml",
      "actors/skeleton_1_elite.xml",
      "actors/archer_1.xml",
      "actors/archer_1_elite.xml" };
    
    static final String[] army2 = 
    { "actors/spawners/skeleton_2.xml",
      "actors/skeleton_2.xml",
      "actors/archer_2.xml",
      "actors/lich_1.xml",
      "actors/lich_2.xml" };
    
    static final String[] archers = 
    { "actors/spawners/archer_1.xml",
      "actors/archer_1.xml",
      "actors/archer_1_elite.xml",
      "actors/archer_2.xml" };
    
    static final String[] liches = 
    { "actors/lich_2.xml",
      "actors/lich_1.xml",
      "actors/lich_1_elite.xml",
      "actors/lich_2.xml",
      "actors/lich_3.xml" };
    
    static final String[] wisps = 
    { "actors/spawners/wisp_1.xml",
      "actors/wisp_1_small.xml",
      "actors/wisp_1.xml" };    
    
    static final String[] slimes = 
    { "actors/slime_1_host.xml",
      "actors/slime_1_spawn.xml" };  
    
    public enum MonsterType {
        
        BAT( bats, 0.3f, "bat" ),
        TICK( ticks, 0.3f, "tick" ),
        MAGGOT( maggots, 0.2f, "maggot" ),
        EYE( eyes, 0.4f, "eye" ),
        SKELETON1( skeletons1, 0.3f, "skeleton1"),
        SKELETON2( skeletons2, 0.3f, "skeleton2" ),
        ARMY1( army1, 0.3f, "army1" ),
        ARMY2( army2, 0.3f, "army2" ),
        ARCHER( archers, 0.2f, "archer" ),
        LICH( liches, 0.2f, "lich" ),
        LICH2( liches, 0.5f, "lich2"),
        WISP( wisps, 0.5f, "wisp"),
        SLIME( slimes, 0.3f, "slime" );
        
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
        return MonsterType.BAT;
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
