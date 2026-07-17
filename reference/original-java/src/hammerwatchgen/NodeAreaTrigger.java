package hammerwatchgen;

public class NodeAreaTrigger extends ScriptNode {

    int event;
    int types;
    int shapeId;
    
    NodeAreaTrigger( float x, float y, NodeType type ) {
        
        super( x, y, type );
        
        event = 0;
        types = 1;
        shapeId = 0;
    }
    
    @Override
    protected XMLDictionary getParametersDict() {
        
        XMLDictionary d = new XMLDictionary("parameters");
        d.addData( new XMLInt( "event", event ) );
        d.addData( new XMLInt( "types", types ) );
        XMLDictionary shapeDict = new XMLDictionary("shape");
        int[] shapeArray = new int[1];
        shapeArray[0] = shapeId;
        shapeDict.addData( new XMLIntArray( "static", shapeArray ));
        d.addData( shapeDict );
        return d;
    }
    
    public void connectToShape( ScriptNode n ) {
        
        shapeId = n.id;
    }
    
}
