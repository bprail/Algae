import re
from hashlib import sha256
import helpers.common as common
import os
import subprocess

def run(students, assignments, args, helpers):
    # for each assignment
    for assign in assignments:
        # for each student
        for student in students:
            cwd = os.getcwd()
            helpers.makeStudentPath(student, assign.name)
            os.chdir(helpers.getStudentPath(student, assign.name))

            command = "cp ../{0}*{1} .".format(student, args['input'])
            p = subprocess.Popen(command, stdout = subprocess.PIPE, stderr = subprocess.PIPE, shell = True)
            o,e = p.communicate()
            
            newest = ""
            newestNum = 0
            for f in os.listdir(os.getcwd()):
                m = re.match("{0}".format(student), f)
            
                # Given the set of student submissions, pick the newest
                if (m):
                    num = f.split('_')[1]
                    if (num > newestNum):
                        newestNum = num
                        newest = f
            
            if (newest != ""):
                if (args['input'] == "tar"):
                    command = "tar xf {0}".format(newest)
                else:
                    print "INPUT TYPE NOT SUPPORTED - {0}".format(args['input'])
                p = subprocess.Popen(command, stdout = subprocess.PIPE, stderr = subprocess.PIPE, shell = True)
                o,e = p.communicate()
            
                # for each specificied file
                files = assign.args["files"]
                for filename in files:
                    # read the raw text
                    rawText = helpers.readFromAssignment(student, assign.name, filename)

                    if rawText != None:
                        # make a friendly filename for saving
                        safeFilename = common.makeFilenameSafe(filename)

                        # mangle it, write the mangled text
                        mangle(rawText, student, assign.name, safeFilename, helpers)
            
            # Delete the other input files then go back
            command = "rm {0}*{1}".format(student, args['input'])
            p = subprocess.Popen(command, stdout = subprocess.PIPE, stderr = subprocess.PIPE, shell = True)
            o,e = p.communicate()
            os.chdir(cwd)

    # all done
    return True
