package hammerwatchgen;

public class NodeLevelExit extends ScriptNode {

    int level;
    int startId;
    int shapeId;
    
    NodeLevelExit( float x, float y, NodeType type ) {
        
        super( x, y, type );
        
        level = Level.currentLevel + 1;
        startId = 0;
        shapeId = 0;
    }
    
    @Override
    protected XMLDictionary getParametersDict() {
        
        XMLDictionary d = new XMLDictionary("parameters");
        d.addData( new XMLString( "level", String.format( "%d",level ) ) );
        d.addData( new XMLInt( "start id", startId ) );
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