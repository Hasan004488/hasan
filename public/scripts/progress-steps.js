let currentTab = 0; // Current tab is set to be the first tab (0)
showTab(currentTab); // Display the current tab

function showTab(n) {
    // This function will display the specified tab of the form ...

    let x = document.getElementsByClassName("tab");
    x[n].style.display = "block";

    // ... and fix the Previous/Next buttons:
    if (n == 0) {
        document.getElementById("prevBtn").innerHTML = `
            <i class="fa fa-times"></i>
            Cancel
        `;
        document.getElementById("prevBtn").onclick = () => {
            if (window.history.length > 1) {
                window.history.back();
            } else {
                window.close();
            }
        };
    } else {
        document.getElementById("prevBtn").innerHTML = `
            <i class="fa fa-arrow-left"></i>
            Previous
        `;
        document.getElementById("prevBtn").onclick = () => nextPrev(-1);
    }

    if (n == (x.length - 1)) {
        document.getElementById("nextBtn").innerHTML = `
      <i class="fa fa-check"></i>
      Submit
    `;
    } else {
        document.getElementById("nextBtn").innerHTML = `
      <i class="fa fa-spinner fa-spin d-none" id="progress-next-loading-icon"></i>
      Next
      <i class="fa fa-arrow-right"></i>
    `;
    }

    // ... and run a function that displays the correct step indicator:
    fixStepIndicator(n);

}

function nextPrev(n) {

    // This function will figure out which tab to display
    let x = document.getElementsByClassName("tab");

    if (n > 0) {

        // going next
        validateForm((valid) => {

            if (valid) {
            
                // Increase or decrease the current tab by 1:
                currentTab = currentTab + n;
            
                // if you have reached the end of the form... :
                if (currentTab >= x.length) {
            
                    //...the form gets submitted:
                    return document.querySelector(window.eitix_progress_form_target).submit();
            
                } else {

                    // Hide the current tab:
                    x[currentTab - n].style.display = "none";
            
                    // Otherwise, display the correct tab:
                    return showTab(currentTab);
            
                }

            } else {
                // reset next button loading
                document.getElementById("nextBtn").innerHTML = `
                  <i class="fa fa-spinner fa-spin d-none" id="progress-next-loading-icon"></i>
                  Next
                  <i class="fa fa-arrow-right"></i>
                `;
            }
    
        })

    } else {

        // going previous
        // Hide the current tab:
        x[currentTab].style.display = "none";
        
        // Increase or decrease the current tab by 1:
        currentTab = currentTab + n;
    
        // if you have reached the end of the form... :
        if (currentTab >= x.length) {
    
            //...the form gets submitted:
            return document.querySelector(window.eitix_progress_form_target).submit();
    
        } else {
    
            // Otherwise, display the correct tab:
            return showTab(currentTab);
    
        }

    }

}

let customValidator = (callback) => {
    // this validator will be used to add more validation to the form
    // it'll be overwritten by the views including progress-steps
    // when overwritten custom validator must show toast (if error) and return valid status
    return callback(true);
}
let validateForm = (callback) => {
    // This function deals with validation of the form fields
    let x, y, i;
    x = document.getElementsByClassName("tab");
    y = x[currentTab].getElementsByTagName("input");
    // validate all input fields (required) in x[currentTab]
    for (i = 0; i < y.length; i++) {
        if (y[i].hasAttribute("required") && y[i].value === "" && !y[i].disabled) {
            toast("Required fields error", "Please fill the required fields", 1);
            return callback(false);
        }
    }
    // extra custom validator
    customValidator((valid) => {

        // If the valid status is true, mark the step as finished and valid:
        if (valid) {
            document.getElementsByClassName("step")[currentTab].className += " finish";
        }
        return callback(valid); // return the valid status
        
    });

}

function fixStepIndicator(n) {

    // This function removes the "active" class of all steps...
    let i, x = document.getElementsByClassName("step");
    for (i = 0; i < x.length; i++) {
        x[i].className = x[i].className.replace(" active", "");
    }
    //... and adds the "active" class to the current step:
    x[n].className += " active";

}

//when enter button is pressed run the nextPrev function
document.addEventListener("keydown", function (event) {

    // if enter is pressed move forward
    if (event.keyCode === 13) {
        // stop the event propagation
        event.preventDefault();
        nextPrev(1);
    }

});