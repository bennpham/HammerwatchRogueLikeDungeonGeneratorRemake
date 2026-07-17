package hammerwatchgen;

public class XMLBool extends XMLObject {

    String name;
    boolean value;
    
    XMLBool( String name, boolean value ) {
        
        this.name = name;
        this.value = value;
    }
    
    @Override
    public String getXML() {
        
        String valueString = "False";
        if( value ) {
            valueString = "True";
        }
        return String.format( "<bool name=\"%s\">%s</bool>", name, valueString );
    }
}
