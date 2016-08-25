/*
RasPiNode-Temperature is a node-based implementation of rpi-gpio and
node-opcua to read the temperature from a TMP01 temperature sensor being
fed through an AD654 voltage-to-frequency converter and send that to an OPC UA
client for processing and display. The current hardware implementation is using
a 5V power supply, 1uF capacitor timer, and 200Ohm timer resistance.
*/

/*
// make a API call every 10 seconds
var interval = 60* 1000;
setInterval(function() {
     var sensor = next_city();
     update_city_data(city);
}, interval);
*/


//Require for node-opcua, the node
//implementation of the OPC UA stack
var opcua = require("node-opcua");
//Require for rpi-gpio, the node library for
//accessing the GPIO pins on a Raspberry Pi
var gpio = require("rpi-gpio");

//Set up pin 11 to receive input
gpio.setup(11, gpio.DIR_IN, gpio.EDGE_BOTH);

var sensors = [
  "temperature" //The temperature sensor
];

var reading = [];

//Set up the frequency counter and pin change listener
var frequency = [];
gpio.on("change", function(channel, value) {
  if (value == 1) {
    frequency[channel]++; //Wave went up, increase the frequency
  }
});

//Set up the interval timer to read the frequency regularly
//The interval is in milliseconds, so 1000 is 1 second
//1000ms is likely ideal, giving a 1 second refresh rate (1hz)
var interval = 1000;
setInterval(function() {
  sensor.forEach(function(sensorName) { //For each sensor we list
    pin = getSensorPin(sensorName); //Get the pin based on the sensor name
    reading[pin] = frequency[pin]; //Take the frequency reading
    frequency[pin] = 0; //Reset the frequency
  });
}, interval);

//To avoid repeating ourselves or having awful numbers scattered everywhere
//we use this function in order to ensure our pin numbers are all tidy and
//in one place for easy editing and consistent retrieval
var getSensorPin = function(sensor) {
  var pinNumber = 0;
  switch (sensor) {
    case "temperature":
      pinNumber = 11;
      break;
    default:
      console.log("ERROR");
      break;
  }
  console.log("Sensor name <" + sensor + "> has been assigned to pin " + pinNumber);
  return pinNumber;
};


//Start the OPC UA server
var server = new opcua.OPCUAServer({
   port: 4334, // the port of the listening socket of the server
   resourcePath: "OPCUA/Dipper" //The custom resource path for the server
});

server.buildInfo.productName = "TemperatureSensor";
server.buildInfo.buildNumber = "0001";
server.buildInfo.buildDate = new Date(2016,7,19);


function post_initialize() {
    console.log("Server Initialized");

    function construct_my_address_space(server) {
      /*
      Now that the server is running, we're going to construct the address
      space for the variable(s) to live in. The first thing we'll do is make
      a folder to keep things tidy
      */
      var sensorsFolder  = server.engine.addressSpace.addFolder("ObjectsFolder",{ browseName: "Sensors"});

      //Now we can start declaring variables in that folder to monitor.
      //This function does that, which is called later in a loop to
      //set up each variable we've asked for
      function create_SensorNode(theSensor) {
         // Create the variables to be read and sent
        server.engine.addressSpace.addVariable({ //Create the variable
          componentOf: sensorsFolder, //In the sensorsFolder folder
          nodeId: "ns=1;s=" + theSensor.toString(), //With an appropriate ID
          browseName: theSensor.toString(), //and an appropriate browseName
          dataType: "Double", //With the type of Double
          value: {
            get: function () { //As an input
              return extract_value(theSensor); //With the extracted value
            }
          }
        });
      }

      //Look over the sensors array, and for each one let's make a variable
      sensors.forEach(function(name) {
         create_SensorNode(name);
      });

      //Let's find the reading of the sensor's value
      function extract_value(sensorName) {
         var sensorReading = reading[getSensorPin(sensorName)];
         if (!sensorReading) { //If we didn't get a reading from the array
            console.log("ERROR: No data has been read yet."); //ERROR!
            return opcua.StatusCodes.BadDataUnavailable;
         }
         //Return the value as an OPC UA variant object
         var returnVar = new opcua.Variant({dataType: opcua.DataType.Double, value: sensorReading});
         return returnVar;
      }
    }
    construct_my_address_space(server);
    server.start(function() {
        console.log("Server is now listening ... ( press CTRL+C to stop)");
        console.log("port ", server.endpoints[0].port);
        var endpointUrl = server.endpoints[0].endpointDescriptions()[0].endpointUrl;
        console.log(" the primary server endpoint url is ", endpointUrl );
    });
}
server.initialize(post_initialize);
