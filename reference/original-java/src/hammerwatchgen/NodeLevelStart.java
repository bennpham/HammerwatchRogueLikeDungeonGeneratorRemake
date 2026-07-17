package hammerwatchgen;

public class NodeLevelStart extends ScriptNode {

    int pId;
    int pDir;
    
    NodeLevelStart( float x, float y, NodeType type ) {
        
        super( x, y, type );
        
        pId = 0;
        pDir = 2;
    }
    
    @Override
    protected XMLDictionary getParametersDict() {
        
        XMLDictionary d = new XMLDictionary("parameters");
        d.addData( new XMLInt( "id", pId ) );
        d.addData( new XMLInt( "dir", pDir ) );
        return d;
    }
}
