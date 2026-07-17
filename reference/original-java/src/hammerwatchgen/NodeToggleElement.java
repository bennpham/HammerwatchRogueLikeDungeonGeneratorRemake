package hammerwatchgen;

public class NodeToggleElement extends ScriptNode {

    int state;
    int element;
    
    NodeToggleElement( float x, float y, NodeType type ) {
        
        super( x, y, type );
        
        state = 1; //disable
        element = 0;
    }
    
    @Override
    protected XMLDictionary getParametersDict() {
        
        XMLDictionary d = new XMLDictionary("parameters");
        d.addData( new XMLInt( "state", state ) );
        XMLDictionary eDict = new XMLDictionary("element");
        int[] shapeArray = new int[1];
        shapeArray[0] = element;
        eDict.addData( new XMLIntArray( "static", shapeArray ));
        d.addData( eDict );
        return d;
    }
    
    public void connectToElement( ScriptNode n ) {
        
        element = n.id;
    }
    
}
