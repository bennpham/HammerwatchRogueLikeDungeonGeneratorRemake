package hammerwatchgen;

import java.util.ArrayList;

public class ScriptNode extends XMLObject {

    static ArrayList<ScriptNode> nodes = new ArrayList<>();
    
    public enum NodeType {
        
        ToggleElement( "ToggleElement" ),
        AreaTrigger( "AreaTrigger" ),
        RespawnPlayers( "RespawnPlayers" ),
        ShopArea( "ShopArea" ),
        LevelStart( "LevelStart" ),
        LevelExit( "LevelExitArea" ),
        AnnounceText( "AnnounceText" ),
        ObjectEventTrigger( "ObjectEventTrigger" ),
        RectangleShape( "RectangleShape" ),
        GameEnd( "GameEnd" );
        
        public XMLString type;
        NodeType( String name ) {
            
            this.type = new XMLString( "type", name );
        }
    }
    
    int id;
    boolean enabled;
    int triggerTimes;
    float x;
    float y;
    NodeType type;
    ArrayList<ScriptNode> connections;
    
    public static ScriptNode Create( float x, float y, NodeType type ) {
        
        ScriptNode n;
        switch( type ) {
            
            case LevelStart:
                n = new NodeLevelStart( x, y, type );
                break;
               
            case LevelExit:
                n = new NodeLevelExit( x, y, type );
                break;
                
            case RectangleShape:
                n = new NodeRectangleShape( x, y, type );
                break;
                
            case ShopArea:
                n = new NodeShopArea( x, y, type );
                break;

            case AnnounceText:
                n = new NodeAnnounceText( x, y, type );
                break;
   
            case ObjectEventTrigger:
                n = new NodeObjectEventTrigger( x, y, type );
                break;
          
            case ToggleElement:
                n = new NodeToggleElement( x, y, type );
                break;
                
            case AreaTrigger:
                n = new NodeAreaTrigger( x, y, type );
                break;
                
            case GameEnd:
            	n = new NodeGameEnd( x, y, type );
            	break;
                
            default:
                n = new ScriptNode( x, y, type );
                break;
        }
        nodes.add(n);
        return n;
    }
    
    public static void Delete( ScriptNode n ) {
        
        nodes.remove(n);
    }
    
    public static void Clear() {
        
        nodes.clear();
    }
    
    ScriptNode( float x, float y, NodeType type ) {
        
        connections = new ArrayList<>();
        this.x = x;
        this.y = y;
        this.type = type;
        this.triggerTimes = -1;
        this.enabled = true;
        this.id = Level.idCounter++;
    }
    
    public void connectTo( ScriptNode n ) {
        
        connections.add( n );
    }
    
    protected XMLDictionary getParametersDict() {
        
        return new XMLDictionary( "parameters" );
    }
    
    public String getXML() {
                
        // create XML structure
        XMLInt idInt = new XMLInt( "id", id );
        XMLString typeString = type.type;
        XMLBool enabledBool = new XMLBool( "enabled", enabled );
        XMLInt triggerInt = new XMLInt( "trigger-times", triggerTimes );
        XMLFloat xFloat = new XMLFloat( "x", x );
        XMLFloat yFloat = new XMLFloat( "y", y );
        XMLDictionary parameters = getParametersDict();
        
        XMLDictionary nodeDict = new XMLDictionary( "" );
        nodeDict.addData(idInt);
        nodeDict.addData(typeString);
        nodeDict.addData(enabledBool);
        nodeDict.addData(triggerInt);
        nodeDict.addData(xFloat);
        nodeDict.addData(yFloat);
        nodeDict.addData(parameters);

        if( !connections.isEmpty() ) {
            
            // create array
            int[] ids = new int[ connections.size() ];
            int[] delays = new int[ connections.size() ];
            for( int i = 0; i < ids.length; i++ ) {
                
                ids[i] = connections.get(i).id;
                delays[i] = 0;
            }
        XMLIntArray conArray = new XMLIntArray( "connections", ids );    
        XMLIntArray delayArray = new XMLIntArray( "delays", ids );
        nodeDict.addData( conArray );
        nodeDict.addData( delayArray );
        }
        
        return nodeDict.getXML();
    }
}