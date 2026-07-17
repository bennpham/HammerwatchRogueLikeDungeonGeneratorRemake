package hammerwatchgen;

import java.util.ArrayList;

public class NodeObjectEventTrigger extends ScriptNode {

    String event;
    ArrayList<Item> itemConnections;
    
    NodeObjectEventTrigger( float x, float y, NodeType type ) {
        
        super( x, y, type );
        
        event = "Destroyed";
        itemConnections = new ArrayList<>();
    }
    
    public void connectItem( Item i ) {
        
        itemConnections.add( i );
    }
    
    @Override
    protected XMLDictionary getParametersDict() {
        
        XMLDictionary d = new XMLDictionary("parameters");
        d.addData( new XMLString( "event", event ) );
        
        XMLDictionary objectDict = new XMLDictionary( "object" );
        int[] array = new int[ itemConnections.size() ];
        for( int i = 0; i < array.length; i++ ) {
            
            array[ i ] = itemConnections.get( i ).id;
        }
        objectDict.addData( new XMLIntArray( "static", array ) );
        d.addData( objectDict );
        
        return d;
    }
}