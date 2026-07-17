package hammerwatchgen;

import java.util.ArrayList;

public class Item extends XMLObject {

    static ArrayList<Item> items = new ArrayList<>();
    
    static final String[] treasureArray =
    {
        "items/valuable_1.xml",
        "items/valuable_2.xml",
        "items/valuable_3.xml",
        "items/valuable_4.xml",
        "items/valuable_5.xml",
        "items/valuable_6.xml",
        "items/valuable_7.xml",
        "items/valuable_8.xml",
        "items/valuable_9.xml"
    };
    
    static final String[] breakablesArray =
    {
        "items/breakable_barrel.xml",
        "items/breakable_barrel_b.xml",
        "items/breakable_barrel_b_v2.xml",
        "items/breakable_barrel_v2.xml",
        "items/breakable_crate.xml",
        "items/breakable_crate_b.xml",
        "items/breakable_vase.xml",
        "items/breakable_vase_v2.xml",
        "items/breakable_vase_v3.xml",
        "items/breakable_vase_v4.xml"
    };
    
    static final String[] foodArray =
    {
        "items/health_1.xml",
        "items/mana_1.xml"
    };    
    
    static final String[] powerupArray =
    {
        "items/powerup_potion1.xml",
        "items/powerup_potion2.xml",
        "items/powerup_potion3.xml",
        "items/powerup_health.xml",
        "items/chest_blue.xml",
        "items/chest_red.xml",
        "items/chest_green.xml",
        "items/chest_wood.xml"
    }; 
    
    static final String[] keyArray =
    {
        "items/key_bronze.xml",
        "items/key_silver.xml",
        "items/key_gold.xml"
    };   
    
    static final String[] doorArray =
    {
        "items/door_a_bronze_h_v2.xml",
        "items/door_a_silver_h_v2.xml",
        "items/door_a_gold_h_v2.xml",
        "items/door_a_bronze_v.xml",
        "items/door_a_silver_v.xml",
        "items/door_a_gold_v.xml",
    };     
    
    static final String[] orbs =
    {
        "items/crystal_purple.xml",
        "items/crystal_green.xml",
        "items/crystal_red.xml"
    };        
    public enum ItemType {
        
        Treasure( treasureArray ),
        Breakable( breakablesArray ), 
        Food( foodArray ), 
        Powerup( powerupArray ),
        Key( keyArray ) ,
        Door( doorArray ),
        Orb( orbs ) ;
        
        public XMLString[] typeStrings;
        ItemType( String[] names ) {
            
            typeStrings = new XMLString[ names.length ];
            for( int i = 0; i < names.length; i++ ) {
                typeStrings[ i ] = new XMLString( "type", names[i] );
            }
        }
    }
    
    int id;
    float x;
    float y;
    ItemType type;
    int index;
    
    public static void Clear() {
        
        items.clear();
    }
    public static Item Create( float x, float y, ItemType type, int index ) {
        
        Item n = new Item( x, y, type, index );
        items.add(n);
        return n;
    }
    
    public static Item Create( float x, float y, ItemType type ) {
        
        Item n = new Item( x, y, type, Rand.iRand(0, type.typeStrings.length ) );
        items.add(n);
        return n;
    }
    
    public static void Delete( Item n ) {
        
        items.remove(n);
    }
    
    Item( float x, float y, ItemType type, int index ) {
        
        this.index = index;
        this.x = x;
        this.y = y;
        this.type = type;
        this.id = Level.idCounter++;
    }

    @Override
    public String getXML() {
                
        // create XML structure
        XMLInt idInt = new XMLInt( "id", id );
        XMLString typeString = type.typeStrings[ index ];
        XMLFloat xFloat = new XMLFloat( "x", x );
        XMLFloat yFloat = new XMLFloat( "y", y );
        
        XMLDictionary dict = new XMLDictionary( "" );
        dict.addData(idInt);
        dict.addData(typeString);
        dict.addData(xFloat);
        dict.addData(yFloat);
        
        return dict.getXML();
    }
}
