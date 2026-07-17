package hammerwatchgen;

public class NodeRectangleShape extends ScriptNode {

    float width;
    float height;
    int types;
    
    NodeRectangleShape( float x, float y, NodeType type ) {
        
        super( x, y, type );
        
        width = 1.0f;
        height = 1.0f;
        types = 15;
    }
    
    @Override
    protected XMLDictionary getParametersDict() {
        
        XMLDictionary d = new XMLDictionary("parameters");
        d.addData( new XMLFloat( "w", width ) );
        d.addData( new XMLFloat( "h", height ) );
        d.addData( new XMLInt( "types", types ) );
        
        return d;
    }
}